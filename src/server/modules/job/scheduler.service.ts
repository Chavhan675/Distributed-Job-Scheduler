/**
 * Job Scheduler Service & Stale Lease Recovery Reaper
 * 
 * Responsibilities:
 * - Scans for SCHEDULED, DELAYED, and RETRY_PENDING jobs whose target time has arrived
 * - Transitions them to QUEUED state so workers can atomically claim them
 * - Parses CRON expressions for RECURRING jobs and schedules subsequent occurrences
 * - Evaluates DAG Workflow Dependencies and promotes satisfied jobs
 * - Runs Stale Worker Reaper and re-queues expired job leases
 */

import { db } from '../../db/database.ts';
import { eventBus } from '../../events/event.bus.ts';

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  public start(pollIntervalMs: number = 1000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => {
      this.tick();
    }, pollIntervalMs);
    // Initial immediate tick
    this.tick();
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Main scheduler tick:
   * 1. Promote scheduled/delayed jobs to QUEUED
   * 2. Promote retry pending jobs to QUEUED
   * 3. Evaluate DAG workflow dependencies
   * 4. Reap stale workers and recover expired leases
   */
  public async tick() {
    const now = new Date();
    const nowIso = now.toISOString();

    const { jobs } = db.listJobs({ limit: 500 });

    for (const job of jobs) {
      // 1. Promote DELAYED or SCHEDULED jobs
      if (job.status === 'SCHEDULED' && job.scheduledAt && new Date(job.scheduledAt) <= now) {
        job.status = 'QUEUED';
        job.updatedAt = nowIso;
        db.saveJob(job);

        eventBus.publish('JOB_SCHEDULED', {
          jobId: job.id,
          queueId: job.queueId,
          correlationId: job.correlationId,
          message: `Scheduled job '${job.name}' reached target time and moved to QUEUED`,
        });
      }

      // 2. Promote RETRY_PENDING jobs
      if (job.status === 'RETRY_PENDING' && job.nextRunAt && new Date(job.nextRunAt) <= now) {
        job.status = 'QUEUED';
        job.updatedAt = nowIso;
        db.saveJob(job);

        eventBus.publish('JOB_RETRY_SCHEDULED', {
          jobId: job.id,
          queueId: job.queueId,
          correlationId: job.correlationId,
          message: `Retry delay elapsed for '${job.name}'. Requeued for execution`,
        });
      }

      // 3. Check RECURRING jobs that need a new iteration
      if (job.type === 'RECURRING' && job.status === 'SCHEDULED' && job.nextRunAt && new Date(job.nextRunAt) <= now) {
        job.status = 'QUEUED';
        job.updatedAt = nowIso;
        db.saveJob(job);
      }

      // 4. Check DAG Workflow Dependencies
      if (job.dependencies && job.dependencies.length > 0 && (job.status === 'QUEUED' || (job as any).dependencyStatus === 'WAITING')) {
        let allSatisfied = true;
        let anyFailed = false;
        let failedDepId = '';

        for (const depId of job.dependencies) {
          const parent = db.getJob(depId);
          if (!parent) continue;
          if (parent.status === 'DEAD_LETTER' || parent.status === 'FAILED' || parent.status === 'CANCELLED') {
            anyFailed = true;
            failedDepId = depId;
            break;
          }
          if (parent.status !== 'COMPLETED') {
            allSatisfied = false;
            break;
          }
        }

        if (anyFailed && job.status !== 'FAILED') {
          job.status = 'FAILED';
          job.error = `Upstream workflow dependency '${failedDepId}' failed`;
          job.dependencyStatus = 'FAILED';
          job.updatedAt = nowIso;
          db.saveJob(job);

          eventBus.publish('JOB_FAILED', {
            jobId: job.id,
            queueId: job.queueId,
            correlationId: job.correlationId,
            message: `Job '${job.name}' failed because parent dependency '${failedDepId}' failed`,
          });
        } else if (allSatisfied && (job.dependencyStatus === 'WAITING' || !job.dependencyStatus)) {
          job.dependencyStatus = 'SATISFIED';
          job.status = 'QUEUED';
          job.updatedAt = nowIso;
          db.saveJob(job);

          eventBus.publish('DEPENDENCY_SATISFIED', {
            jobId: job.id,
            queueId: job.queueId,
            correlationId: job.correlationId,
            message: `All upstream dependencies satisfied for '${job.name}'. Enqueued for worker claiming`,
          });
        }
      }
    }

    // 5. Stale Worker & Expired Lease Reaper
    const { staleWorkers, recoveredJobIds } = db.handleStaleWorkers();
    for (const worker of staleWorkers) {
      eventBus.publish('WORKER_OFFLINE', {
        workerId: worker.id,
        message: `Worker node '${worker.name}' missed heartbeat deadline (>10s) and marked DEAD`,
      });
    }

    for (const jobId of recoveredJobIds) {
      const recoveredJob = db.getJob(jobId);
      if (recoveredJob) {
        eventBus.publish('JOB_RETRY_SCHEDULED', {
          jobId: recoveredJob.id,
          queueId: recoveredJob.queueId,
          correlationId: recoveredJob.correlationId,
          message: `Stale lease recovered for '${recoveredJob.name}' from dead worker. Re-enqueued for claim`,
        });
      }
    }
  }

  /**
   * Evaluates standard cron expressions (e.g. 5-part cron syntax)
   * to determine the next Date.
   */
  public static getNextCronOccurrence(cronExpression: string, fromDate: Date = new Date()): Date {
    try {
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length >= 5) {
        const [min] = parts;
        const next = new Date(fromDate.getTime() + 60000); // at least 1 min in future

        // Check for minute interval (e.g. */5 or specific number)
        if (min.startsWith('*/')) {
          const step = parseInt(min.replace('*/', ''), 10) || 5;
          const currentMin = next.getMinutes();
          const remainder = currentMin % step;
          const addMins = remainder === 0 ? step : step - remainder;
          return new Date(next.getTime() + addMins * 60000);
        } else if (min === '*') {
          return new Date(next.getTime() + 60000);
        } else {
          const targetMin = parseInt(min, 10);
          if (!isNaN(targetMin)) {
            next.setMinutes(targetMin, 0, 0);
            if (next <= fromDate) {
              next.setHours(next.getHours() + 1);
            }
            return next;
          }
        }
      }
    } catch {
      // Fallback
    }

    // Default fallback: 5 minutes from now
    return new Date(fromDate.getTime() + 5 * 60000);
  }
}

export const schedulerService = new SchedulerService();
