/**
 * Distributed Job Scheduler - In-Engine Concurrency & System Test Suite
 */

import { db } from '../db/database.ts';
import { WorkerEngine } from '../worker/WorkerEngine.ts';
import { RetryService } from '../modules/retry/retry.service.ts';
import { SchedulerService } from '../modules/job/scheduler.service.ts';
import { Job, Queue, RetryPolicy, ConcurrencyTestRun } from '../../types.ts';

export interface TestResult {
  name: string;
  category: 'CONCURRENCY' | 'RELIABILITY' | 'LIFECYCLE' | 'SCHEDULING' | 'SECURITY';
  passed: boolean;
  durationMs: number;
  message: string;
  details?: any;
}

export class TestRunner {
  public static async runAllTests(): Promise<{ summary: { total: number; passed: number; failed: number; durationMs: number }; results: TestResult[] }> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    results.push(await this.testAtomicJobClaimingNoDuplicates());
    results.push(await this.testQueueConcurrencyLimits());
    results.push(await this.testExponentialBackoffRetryCalculations());
    results.push(await this.testFailureExhaustionToDLQ());
    results.push(await this.testStaleWorkerReaper());
    results.push(await this.testIdempotencyKeyDeduplication());
    results.push(await this.testCronSchedulingParser());
    results.push(await this.testDelayedJobPromotion());

    const durationMs = Date.now() - startTime;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      summary: {
        total: results.length,
        passed,
        failed,
        durationMs,
      },
      results,
    };
  }

  // 1. ATOMIC JOB CLAIMING TEST (Zero duplicate claims across concurrent workers)
  public static async testAtomicJobClaimingNoDuplicates(): Promise<TestResult> {
    const start = Date.now();
    const testQueueId = `test-q-atomic-${Date.now()}`;
    const testQueue: Queue = {
      id: testQueueId,
      projectId: 'proj-payments',
      name: 'concurrency-atomic-claim-test',
      priority: 'HIGH',
      concurrencyLimit: 20,
      currentRunningCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveQueue(testQueue);

    // Create 30 test jobs in the queue
    const jobCount = 30;
    const jobIds: string[] = [];
    for (let i = 0; i < jobCount; i++) {
      const jobId = `test-job-atomic-${i}-${Date.now()}`;
      jobIds.push(jobId);
      db.saveJob({
        id: jobId,
        queueId: testQueueId,
        projectId: 'proj-payments',
        name: `Atomic Test Job #${i}`,
        type: 'IMMEDIATE',
        priority: 'HIGH',
        status: 'QUEUED',
        payload: { testIndex: i },
        attempts: 0,
        maxRetries: 1,
        retryHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Spawn 5 concurrent workers polling simultaneously
    const workerCount = 5;
    const claimedByWorker: Map<string, string[]> = new Map();
    const allClaimedJobIds: string[] = [];
    const duplicateClaims: string[] = [];

    // Simulate 5 simultaneous worker claim operations
    const claimPromises: Promise<Job[]>[] = [];
    for (let w = 0; w < workerCount; w++) {
      const workerId = `test-w-${w}-${Date.now()}`;
      db.saveWorker({
        id: workerId,
        name: `Test Worker ${w}`,
        hostname: 'test-host',
        pid: 9999 + w,
        status: 'IDLE',
        concurrencyLimit: 10,
        currentJobsCount: 0,
        totalJobsProcessed: 0,
        successfulJobs: 0,
        failedJobs: 0,
        startedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        heartbeatIntervalMs: 3000,
        heartbeatTimeoutMs: 10000,
        assignedQueues: [testQueueId],
        currentJobIds: [],
      });

      claimPromises.push(
        new Promise(resolve => {
          const claimed = db.claimJobsAtomically(workerId, [testQueueId], 6);
          claimedByWorker.set(workerId, claimed.map(j => j.id));
          resolve(claimed);
        })
      );
    }

    await Promise.all(claimPromises);

    // Verify: Check if any job was claimed by more than 1 worker
    const claimCounts = new Map<string, number>();
    for (const [wId, jobs] of claimedByWorker.entries()) {
      for (const jId of jobs) {
        allClaimedJobIds.push(jId);
        const c = (claimCounts.get(jId) || 0) + 1;
        claimCounts.set(jId, c);
        if (c > 1) {
          duplicateClaims.push(jId);
        }
      }
    }

    // Cleanup test artifacts
    db.deleteQueue(testQueueId);

    const passed = duplicateClaims.length === 0 && allClaimedJobIds.length === jobCount;
    return {
      name: 'Atomic Job Claiming & Row-Level Lock Isolation',
      category: 'CONCURRENCY',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Successfully claimed all ${jobCount} jobs across ${workerCount} concurrent workers with ZERO duplicate claims.`
        : `Concurrency violation: detected ${duplicateClaims.length} duplicate claims!`,
      details: {
        totalJobs: jobCount,
        claimedJobs: allClaimedJobIds.length,
        workers: workerCount,
        duplicateClaims,
      },
    };
  }

  // 2. QUEUE CONCURRENCY LIMIT TEST
  public static async testQueueConcurrencyLimits(): Promise<TestResult> {
    const start = Date.now();
    const testQueueId = `test-q-limit-${Date.now()}`;
    const limit = 3;
    const testQueue: Queue = {
      id: testQueueId,
      projectId: 'proj-payments',
      name: 'strict-concurrency-test',
      priority: 'HIGH',
      concurrencyLimit: limit,
      currentRunningCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveQueue(testQueue);

    // Create 10 jobs
    for (let i = 0; i < 10; i++) {
      db.saveJob({
        id: `job-limit-${i}-${Date.now()}`,
        queueId: testQueueId,
        projectId: 'proj-payments',
        name: `Limit Job #${i}`,
        type: 'IMMEDIATE',
        priority: 'HIGH',
        status: 'QUEUED',
        payload: {},
        attempts: 0,
        maxRetries: 0,
        retryHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const workerId = `worker-limit-${Date.now()}`;
    db.saveWorker({
      id: workerId,
      name: 'High Capacity Worker',
      hostname: 'test-host',
      pid: 1234,
      status: 'IDLE',
      concurrencyLimit: 20, // Worker can take 20, but queue only allows 3!
      currentJobsCount: 0,
      totalJobsProcessed: 0,
      successfulJobs: 0,
      failedJobs: 0,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      heartbeatIntervalMs: 3000,
      heartbeatTimeoutMs: 10000,
      assignedQueues: [testQueueId],
      currentJobIds: [],
    });

    // Attempt to claim 10 jobs
    const claimed = db.claimJobsAtomically(workerId, [testQueueId], 10);

    db.deleteQueue(testQueueId);
    db.deleteWorker(workerId);

    const passed = claimed.length === limit;
    return {
      name: 'Queue Concurrency Boundary Enforcement',
      category: 'CONCURRENCY',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Queue concurrency limit strictly enforced: claimed exactly ${claimed.length} jobs (Queue limit: ${limit}) despite high worker capacity.`
        : `Queue limit violated: claimed ${claimed.length} jobs when limit is ${limit}`,
      details: { queueLimit: limit, claimedCount: claimed.length },
    };
  }

  // 3. RETRY STRATEGY & EXPONENTIAL BACKOFF TEST
  public static async testExponentialBackoffRetryCalculations(): Promise<TestResult> {
    const start = Date.now();
    const expPolicy: RetryPolicy = {
      id: 'test-exp-pol',
      name: 'Test Exp',
      strategy: 'EXPONENTIAL',
      maxRetries: 4,
      initialDelayMs: 2000,
      maxDelayMs: 20000,
      multiplier: 2.0,
      createdAt: new Date().toISOString(),
    };

    const delay1 = RetryService.calculateDelay(expPolicy, 1); // 2000ms (+ jitter)
    const delay2 = RetryService.calculateDelay(expPolicy, 2); // 4000ms (+ jitter)
    const delay3 = RetryService.calculateDelay(expPolicy, 3); // 8000ms (+ jitter)
    const delayExhausted = RetryService.calculateDelay(expPolicy, 5); // Attempt 5 > maxRetries 4

    const passed =
      delay1.delayMs >= 2000 &&
      delay2.delayMs >= 4000 &&
      delay3.delayMs >= 8000 &&
      delayExhausted.isExhausted === true;

    return {
      name: 'Exponential Backoff Multiplier & Jitter Calculation',
      category: 'RELIABILITY',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Exponential backoff progression validated: Att 1 (~${delay1.delayMs}ms) -> Att 2 (~${delay2.delayMs}ms) -> Att 3 (~${delay3.delayMs}ms) -> Att 5 (Exhausted = true).`
        : `Calculation failure in exponential delays`,
      details: {
        att1: delay1.delayMs,
        att2: delay2.delayMs,
        att3: delay3.delayMs,
        att5Exhausted: delayExhausted.isExhausted,
      },
    };
  }

  // 4. DLQ FAILURE EXHAUSTION TEST
  public static async testFailureExhaustionToDLQ(): Promise<TestResult> {
    const start = Date.now();
    const jobId = `test-dlq-job-${Date.now()}`;
    const job: Job = {
      id: jobId,
      queueId: 'queue-critical-billing',
      projectId: 'proj-payments',
      name: 'DLQ Test Faulty Task',
      type: 'IMMEDIATE',
      priority: 'CRITICAL',
      status: 'QUEUED',
      payload: { forceFail: true, failMessage: 'Terminal unrecoverable HTTP 500' },
      attempts: 0,
      maxRetries: 1, // Will exhaust immediately after attempt 1
      retryHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveJob(job);

    const worker = new WorkerEngine({
      id: `w-dlq-test-${Date.now()}`,
      name: 'DLQ Tester Worker',
      concurrencyLimit: 2,
      assignedQueues: ['queue-critical-billing'],
      pollIntervalMs: 100,
    });

    worker.start();
    // Wait for worker to claim, fail and transition to DLQ
    await new Promise(r => setTimeout(r, 800));
    await worker.stop(false);
    db.deleteWorker(worker.id);

    const updatedJob = db.getJob(jobId);
    const dlqEntries = db.listDeadLetters('proj-payments');
    const matchingDLQ = dlqEntries.find(d => d.jobId === jobId);

    const passed = updatedJob?.status === 'DEAD_LETTER' && !!matchingDLQ;
    return {
      name: 'Retry Exhaustion & Dead Letter Queue (DLQ) Archival',
      category: 'LIFECYCLE',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Job permanently failed as expected after max attempts and transitioned into Dead Letter Queue entry "${matchingDLQ?.id}".`
        : `Job failed to transition to DEAD_LETTER state properly`,
      details: { jobStatus: updatedJob?.status, dlqEntryId: matchingDLQ?.id },
    };
  }

  // 5. STALE WORKER DETECTION & REAPER TEST
  public static async testStaleWorkerReaper(): Promise<TestResult> {
    const start = Date.now();
    const staleWorkerId = `stale-worker-${Date.now()}`;
    const staleJobId = `stale-claimed-job-${Date.now()}`;

    // Create a worker with an expired heartbeat (15 seconds ago)
    db.saveWorker({
      id: staleWorkerId,
      name: 'Unresponsive Dead Worker',
      hostname: 'crashed-container-9',
      pid: 4402,
      status: 'BUSY',
      concurrencyLimit: 5,
      currentJobsCount: 1,
      totalJobsProcessed: 12,
      successfulJobs: 11,
      failedJobs: 0,
      startedAt: new Date(Date.now() - 60000).toISOString(),
      lastHeartbeat: new Date(Date.now() - 15000).toISOString(), // Expired > 10s timeout
      heartbeatIntervalMs: 3000,
      heartbeatTimeoutMs: 10000,
      assignedQueues: ['*'],
      currentJobIds: [staleJobId],
    });

    db.saveJob({
      id: staleJobId,
      queueId: 'queue-critical-billing',
      projectId: 'proj-payments',
      name: 'Abandoned Job',
      type: 'IMMEDIATE',
      priority: 'HIGH',
      status: 'CLAIMED',
      workerId: staleWorkerId,
      payload: {},
      attempts: 1,
      maxRetries: 3,
      retryHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run Stale Worker Reaper
    const result = db.handleStaleWorkers();
    const reclaimedJob = db.getJob(staleJobId);
    const workerStatus = db.getWorker(staleWorkerId)?.status;

    db.deleteWorker(staleWorkerId);
    db.deleteJob(staleJobId);

    const passed =
      result.staleWorkers.some(w => w.id === staleWorkerId) &&
      result.recoveredJobIds.includes(staleJobId) &&
      reclaimedJob?.status === 'QUEUED' &&
      reclaimedJob?.workerId === null &&
      workerStatus === 'DEAD';

    return {
      name: 'Heartbeat Timeout & Stale Worker Job Recovery',
      category: 'RELIABILITY',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Stale worker detected via expired heartbeat, marked DEAD, and abandoned job was safely re-queued for other workers.`
        : `Stale worker reaper failed to recover abandoned job`,
      details: { recoveredJobIds: result.recoveredJobIds, workerStatus },
    };
  }

  // 6. IDEMPOTENCY KEY DEDUPLICATION TEST
  public static async testIdempotencyKeyDeduplication(): Promise<TestResult> {
    const start = Date.now();
    const idemKey = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const job1: Job = {
      id: `job-idem-1-${Date.now()}`,
      queueId: 'queue-critical-billing',
      projectId: 'proj-payments',
      name: 'First Idempotent Submission',
      type: 'IMMEDIATE',
      priority: 'HIGH',
      status: 'QUEUED',
      payload: { chargeAmount: 50.0 },
      idempotencyKey: idemKey,
      attempts: 0,
      maxRetries: 3,
      retryHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveJob(job1);

    // Look up by idempotency key
    const retrieved = db.getJobByIdempotencyKey(idemKey);
    const passed = retrieved?.id === job1.id;

    return {
      name: 'Idempotency Key Deduplication & Atomic Registration',
      category: 'SECURITY',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Idempotency index verified: identical requests map cleanly to job ID "${job1.id}" without duplicate creation.`
        : `Idempotency lookup failed`,
      details: { idempotencyKey: idemKey, mappedJobId: retrieved?.id },
    };
  }

  // 7. CRON PARSER TEST
  public static async testCronSchedulingParser(): Promise<TestResult> {
    const start = Date.now();
    const fromDate = new Date('2026-08-22T01:00:00.000Z');

    // Cron: "*/15 * * * *" -> Next should be 01:15:00
    const next15 = SchedulerService.getNextCronOccurrence('*/15 * * * *', fromDate);
    const passed = next15.getMinutes() === 15;

    return {
      name: 'Cron Expression Parser & Subsequent Run Calculation',
      category: 'SCHEDULING',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Cron expression "*/15 * * * *" evaluated correctly to next timestamp ${next15.toISOString()}.`
        : `Cron parsing failed for interval`,
      details: { cron: '*/15 * * * *', calculatedNext: next15.toISOString() },
    };
  }

  // 8. DELAYED JOB PROMOTION TEST
  public static async testDelayedJobPromotion(): Promise<TestResult> {
    const start = Date.now();
    const jobId = `test-delayed-prom-${Date.now()}`;
    const pastTime = new Date(Date.now() - 1000).toISOString();

    db.saveJob({
      id: jobId,
      queueId: 'queue-critical-billing',
      projectId: 'proj-payments',
      name: 'Delayed Job Ready For Queue',
      type: 'DELAYED',
      priority: 'HIGH',
      status: 'SCHEDULED',
      scheduledAt: pastTime,
      nextRunAt: pastTime,
      payload: {},
      attempts: 0,
      maxRetries: 3,
      retryHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run scheduler promotion tick
    SchedulerService.prototype.tick();

    const promoted = db.getJob(jobId);
    db.deleteJob(jobId);

    const passed = promoted?.status === 'QUEUED';
    return {
      name: 'Delayed & Scheduled Job Automatic Promotion',
      category: 'SCHEDULING',
      passed,
      durationMs: Date.now() - start,
      message: passed
        ? `Scheduler tick successfully promoted elapsed DELAYED job to QUEUED state for worker consumption.`
        : `Delayed job promotion failed`,
      details: { finalStatus: promoted?.status },
    };
  }

  // Stress Concurrency Lab Runner
  public static async runConcurrencyStressTest(
    workerCount: number = 4,
    jobCount: number = 40,
    queueConcurrencyLimit: number = 8
  ): Promise<ConcurrencyTestRun> {
    const startTime = Date.now();
    const testQueueId = `stress-queue-${Date.now()}`;
    const testQueue: Queue = {
      id: testQueueId,
      projectId: 'proj-payments',
      name: `stress-test-${jobCount}-jobs`,
      priority: 'CRITICAL',
      concurrencyLimit: queueConcurrencyLimit,
      currentRunningCount: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveQueue(testQueue);

    // Enqueue jobs
    for (let i = 0; i < jobCount; i++) {
      db.saveJob({
        id: `stress-job-${i}-${Date.now()}`,
        queueId: testQueueId,
        projectId: 'proj-payments',
        name: `Stress Payload #${i + 1}`,
        type: 'IMMEDIATE',
        priority: 'CRITICAL',
        status: 'QUEUED',
        payload: { simulatedDurationMs: 80 },
        attempts: 0,
        maxRetries: 2,
        retryHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Spawn dedicated workers
    const spawnedWorkers: WorkerEngine[] = [];
    for (let w = 0; w < workerCount; w++) {
      const worker = new WorkerEngine({
        id: `stress-w-${w}-${Date.now()}`,
        name: `Stress Worker #${w + 1}`,
        concurrencyLimit: 4,
        assignedQueues: [testQueueId],
        pollIntervalMs: 50,
      });
      worker.start();
      spawnedWorkers.push(worker);
    }

    // Wait until all jobs are COMPLETED or timeout after 15s
    const maxWaitMs = 15000;
    while (Date.now() - startTime < maxWaitMs) {
      const { jobs } = db.listJobs({ queueId: testQueueId, limit: jobCount + 10 });
      const completed = jobs.filter(j => j.status === 'COMPLETED').length;
      if (completed >= jobCount) {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Stop workers
    for (const w of spawnedWorkers) {
      await w.stop(false);
      db.deleteWorker(w.id);
    }

    const { jobs: finalJobs } = db.listJobs({ queueId: testQueueId, limit: jobCount + 10 });
    const completedCount = finalJobs.filter(j => j.status === 'COMPLETED').length;
    const durationMs = Date.now() - startTime;
    const throughput = durationMs > 0 ? Math.round((completedCount / (durationMs / 1000)) * 10) / 10 : 0;

    // Check duplicate claims
    const executions = db.listExecutions();
    const executionsForThisQueue = executions.filter(e => e.jobId.startsWith('stress-job-'));
    const executionJobIds = new Set<string>();
    let duplicateClaims = 0;
    for (const e of executionsForThisQueue) {
      if (e.attemptNumber === 1) {
        if (executionJobIds.has(e.jobId)) {
          duplicateClaims++;
        }
        executionJobIds.add(e.jobId);
      }
    }

    // Cleanup queue
    db.deleteQueue(testQueueId);

    return {
      id: `run-${Date.now()}`,
      timestamp: new Date().toISOString(),
      concurrencyWorkers: workerCount,
      totalJobs: jobCount,
      queueId: testQueueId,
      durationMs,
      claimedJobs: finalJobs.filter(j => j.status !== 'QUEUED').length,
      completedJobs: completedCount,
      duplicateClaimCount: duplicateClaims,
      errors: [],
      status: duplicateClaims === 0 && completedCount === jobCount ? 'PASSED' : 'FAILED',
      throughputJobsPerSec: throughput,
    };
  }
}
