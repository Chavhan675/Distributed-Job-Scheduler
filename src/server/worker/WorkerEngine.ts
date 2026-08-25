/**
 * Worker Engine
 * 
 * An independent worker instance that:
 * - Polls queues and claims jobs atomically
 * - Enforces queue concurrency limits
 * - Executes jobs concurrently up to worker concurrency limit
 * - Periodically transmits heartbeats
 * - Handles execution failures, retries with backoff, and dead letter transitions
 * - Broadcasts domain events to Redis & SSE clients
 * - Supports graceful draining and shutdown
 */

import { db } from '../db/database.ts';
import { Worker, Job, JobExecution, DeadLetterEntry, WorkerStatus } from '../../types.ts';
import { JobExecutors } from './jobExecutors.ts';
import { RetryService } from '../modules/retry/retry.service.ts';
import { SchedulerService } from '../modules/job/scheduler.service.ts';
import { eventBus } from '../events/event.bus.ts';

export class WorkerEngine {
  public id: string;
  public name: string;
  public concurrencyLimit: number;
  public assignedQueues: string[] | '*';
  public pollIntervalMs: number;
  public heartbeatIntervalMs: number;
  public heartbeatTimeoutMs: number;

  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private activeExecutionsCount: number = 0;
  private status: WorkerStatus = 'IDLE';

  constructor(config: {
    id: string;
    name: string;
    concurrencyLimit?: number;
    assignedQueues?: string[] | '*';
    pollIntervalMs?: number;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.concurrencyLimit = config.concurrencyLimit || 5;
    this.assignedQueues = config.assignedQueues || '*';
    this.pollIntervalMs = config.pollIntervalMs || 500;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs || 3000;
    this.heartbeatTimeoutMs = config.heartbeatTimeoutMs || 10000;

    this.register();
  }

  private register() {
    const worker: Worker = {
      id: this.id,
      name: this.name,
      hostname: typeof process !== 'undefined' ? process.env.HOSTNAME || 'worker-host-01' : 'worker-node',
      pid: typeof process !== 'undefined' ? process.pid || 1000 : 1000,
      status: 'IDLE',
      concurrencyLimit: this.concurrencyLimit,
      currentJobsCount: 0,
      totalJobsProcessed: 0,
      successfulJobs: 0,
      failedJobs: 0,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatTimeoutMs: this.heartbeatTimeoutMs,
      assignedQueues: Array.isArray(this.assignedQueues) ? this.assignedQueues : ['*'],
      currentJobIds: [],
    };
    db.saveWorker(worker);

    eventBus.publish('WORKER_REGISTERED', {
      workerId: this.id,
      message: `Worker node '${this.name}' (${this.id}) registered into fleet`,
    });
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.status = 'IDLE';

    // Start poll loop
    this.pollTimer = setInterval(() => {
      this.pollAndExecute();
    }, this.pollIntervalMs);

    // Start heartbeat loop
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);

    this.sendHeartbeat();
  }

  public pause() {
    this.status = 'PAUSED';
    const worker = db.getWorker(this.id);
    if (worker) {
      worker.status = 'PAUSED';
      db.saveWorker(worker);
    }
  }

  public resume() {
    this.status = this.activeExecutionsCount > 0 ? 'BUSY' : 'IDLE';
    const worker = db.getWorker(this.id);
    if (worker) {
      worker.status = this.status;
      db.saveWorker(worker);
    }
  }

  public async stop(graceful: boolean = true) {
    this.isRunning = false;
    this.status = graceful ? 'DRAINING' : 'STOPPED';

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (graceful && this.activeExecutionsCount > 0) {
      // Wait for running jobs to finish (up to 5 seconds)
      const startWait = Date.now();
      while (this.activeExecutionsCount > 0 && Date.now() - startWait < 5000) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.status = 'STOPPED';
    const worker = db.getWorker(this.id);
    if (worker) {
      worker.status = 'STOPPED';
      worker.currentJobIds = [];
      worker.currentJobsCount = 0;
      db.saveWorker(worker);
    }

    eventBus.publish('WORKER_OFFLINE', {
      workerId: this.id,
      message: `Worker node '${this.name}' is offline`,
    });
  }

  private sendHeartbeat() {
    if (!this.isRunning && this.status === 'STOPPED') return;

    db.recordHeartbeat({
      workerId: this.id,
      timestamp: new Date().toISOString(),
      status: this.status,
      currentJobsCount: this.activeExecutionsCount,
      memoryUsageMb: Math.round(50 + Math.random() * 20),
      cpuLoadPercent: Math.round(10 + Math.random() * 25 + (this.activeExecutionsCount * 10)),
    });
  }

  private async pollAndExecute() {
    if (!this.isRunning || this.status === 'PAUSED' || this.status === 'DRAINING') {
      return;
    }

    const availableSlots = this.concurrencyLimit - this.activeExecutionsCount;
    if (availableSlots <= 0) {
      return;
    }

    // Atomically claim eligible jobs with row locking (SELECT ... FOR UPDATE SKIP LOCKED)
    const claimedJobs = db.claimJobsAtomically(
      this.id,
      this.assignedQueues,
      availableSlots,
      30000 // 30s lease
    );

    if (claimedJobs.length === 0) {
      if (this.activeExecutionsCount === 0 && this.status !== 'IDLE') {
        this.status = 'IDLE';
        this.sendHeartbeat();
      }
      return;
    }

    this.status = 'BUSY';
    for (const job of claimedJobs) {
      eventBus.publish('JOB_CLAIMED', {
        jobId: job.id,
        queueId: job.queueId,
        workerId: this.id,
        correlationId: job.correlationId,
        message: `Job '${job.name}' atomically claimed by worker ${this.name}`,
      });

      this.executeJob(job);
    }
  }

  private async executeJob(job: Job) {
    this.activeExecutionsCount++;
    const now = new Date();
    const nowIso = now.toISOString();

    // Transition state to RUNNING
    job.status = 'RUNNING';
    job.startedAt = nowIso;
    job.attempts = (job.attempts || 0) + 1;
    job.updatedAt = nowIso;
    db.saveJob(job);

    await eventBus.publish('JOB_STARTED', {
      jobId: job.id,
      queueId: job.queueId,
      workerId: this.id,
      correlationId: job.correlationId,
      message: `Job '${job.name}' execution started (Attempt #${job.attempts})`,
    });

    const execId = `exec-${job.id}-${job.attempts}-${Date.now()}`;
    const execution: JobExecution = {
      id: execId,
      jobId: job.id,
      workerId: this.id,
      attemptNumber: job.attempts,
      status: 'RUNNING',
      startedAt: nowIso,
      logs: [],
    };
    db.saveExecution(execution);

    const startTime = Date.now();

    try {
      // Execute the job handler
      const result = await JobExecutors.execute(job.name, job.payload, job.attempts);
      const durationMs = Date.now() - startTime;
      const completedIso = new Date().toISOString();

      execution.completedAt = completedIso;
      execution.durationMs = durationMs;
      execution.logs = result.logs;

      const worker = db.getWorker(this.id);

      if (result.success) {
        // SUCCESS
        execution.status = 'SUCCESS';
        execution.metadata = result.result;
        db.saveExecution(execution);

        job.status = 'COMPLETED';
        job.result = result.result;
        job.completedAt = completedIso;
        job.error = null;
        job.workerId = null;
        job.leaseExpiresAt = null;
        job.updatedAt = completedIso;
        db.saveJob(job);

        await eventBus.publish('JOB_COMPLETED', {
          jobId: job.id,
          queueId: job.queueId,
          workerId: this.id,
          correlationId: job.correlationId,
          payload: { durationMs, result: result.result },
          message: `Job '${job.name}' completed successfully in ${durationMs}ms`,
        });

        if (worker) {
          worker.totalJobsProcessed = (worker.totalJobsProcessed || 0) + 1;
          worker.successfulJobs = (worker.successfulJobs || 0) + 1;
          worker.currentJobIds = worker.currentJobIds.filter(id => id !== job.id);
          worker.currentJobsCount = worker.currentJobIds.length;
          db.saveWorker(worker);
        }

        // Check if Recurring job: schedule next run
        if (job.type === 'RECURRING' && job.cronExpression) {
          const nextRun = SchedulerService.getNextCronOccurrence(job.cronExpression);
          const nextJob: Job = {
            ...job,
            id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            status: 'SCHEDULED',
            nextRunAt: nextRun.toISOString(),
            scheduledAt: nextRun.toISOString(),
            attempts: 0,
            result: null,
            error: null,
            retryHistory: [],
            createdAt: completedIso,
            updatedAt: completedIso,
            startedAt: null,
            completedAt: null,
          };
          db.saveJob(nextJob);

          await eventBus.publish('JOB_SCHEDULED', {
            jobId: nextJob.id,
            queueId: nextJob.queueId,
            correlationId: nextJob.correlationId,
            message: `Next recurring occurrence of '${job.name}' scheduled for ${nextRun.toLocaleTimeString()}`,
          });
        }
      } else {
        // FAILURE
        this.handleJobFailure(job, execution, result.error || 'Job execution failed', durationMs);
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.handleJobFailure(job, execution, err.message || String(err), durationMs);
    } finally {
      this.activeExecutionsCount--;
      if (this.activeExecutionsCount <= 0 && this.status === 'BUSY') {
        this.status = 'IDLE';
      }
      this.sendHeartbeat();
    }
  }

  private async handleJobFailure(job: Job, execution: JobExecution, errorMsg: string, durationMs: number) {
    const failedIso = new Date().toISOString();
    execution.status = 'FAILURE';
    execution.error = errorMsg;
    execution.completedAt = failedIso;
    execution.durationMs = durationMs;
    db.saveExecution(execution);

    const worker = db.getWorker(this.id);
    if (worker) {
      worker.totalJobsProcessed = (worker.totalJobsProcessed || 0) + 1;
      worker.failedJobs = (worker.failedJobs || 0) + 1;
      worker.currentJobIds = worker.currentJobIds.filter(id => id !== job.id);
      worker.currentJobsCount = worker.currentJobIds.length;
      db.saveWorker(worker);
    }

    // Resolve retry policy (job-level or queue-level)
    let policy = job.retryPolicy || (job.retryPolicyId ? db.getRetryPolicy(job.retryPolicyId) : null);
    if (!policy) {
      const queue = db.getQueue(job.queueId);
      if (queue?.retryPolicyId) {
        policy = db.getRetryPolicy(queue.retryPolicyId) || null;
      }
    }

    const maxRetries = job.maxRetries ?? policy?.maxRetries ?? 3;

    if (job.attempts < maxRetries && policy) {
      // RETRY PENDING
      const calculation = RetryService.calculateDelay(policy, job.attempts);
      const retryRecord = RetryService.createRetryRecord(
        job.attempts,
        errorMsg,
        policy,
        calculation.delayMs,
        calculation.nextRetryAt,
        this.id
      );

      job.retryHistory = job.retryHistory || [];
      job.retryHistory.push(retryRecord);
      job.status = 'RETRY_PENDING';
      job.error = errorMsg;
      job.nextRunAt = calculation.nextRetryAt.toISOString();
      job.workerId = null;
      job.leaseExpiresAt = null;
      job.updatedAt = failedIso;
      db.saveJob(job);

      await eventBus.publish('JOB_RETRY_SCHEDULED', {
        jobId: job.id,
        queueId: job.queueId,
        workerId: this.id,
        correlationId: job.correlationId,
        payload: { attempt: job.attempts, delayMs: calculation.delayMs, strategy: policy.strategy },
        message: `Job '${job.name}' failed on attempt ${job.attempts}. Retry scheduled in ${calculation.delayMs}ms (${policy.strategy} backoff)`,
      });
    } else {
      // RETRIES EXHAUSTED -> DEAD LETTER QUEUE (DLQ)
      job.status = 'DEAD_LETTER';
      job.error = errorMsg;
      job.failedAt = failedIso;
      job.workerId = null;
      job.leaseExpiresAt = null;
      job.updatedAt = failedIso;
      db.saveJob(job);

      const dlqEntry: DeadLetterEntry = {
        id: `dlq-${job.id}-${Date.now()}`,
        jobId: job.id,
        queueId: job.queueId,
        projectId: job.projectId,
        jobName: job.name,
        payload: job.payload,
        totalAttempts: job.attempts,
        failureReason: `Exhausted all ${maxRetries} retry attempts: ${errorMsg}`,
        finalError: errorMsg,
        failedAt: failedIso,
        lastWorkerId: this.id,
      };
      db.saveDeadLetterEntry(dlqEntry);

      await eventBus.publish('JOB_MOVED_TO_DLQ', {
        jobId: job.id,
        queueId: job.queueId,
        workerId: this.id,
        correlationId: job.correlationId,
        payload: { attempts: job.attempts, error: errorMsg },
        message: `Job '${job.name}' exhausted all ${maxRetries} retries and moved to Dead Letter Queue`,
      });
    }
  }
}
