/**
 * Worker Pool Manager
 * 
 * Manages the fleet of worker processes:
 * - Bootstrapping default worker cluster
 * - Dynamically scaling workers up/down
 * - Stale worker detection and job recovery
 * - Cluster-wide metrics and status
 */

import { WorkerEngine } from './WorkerEngine.ts';
import { db } from '../db/database.ts';
import { Worker } from '../../types.ts';

export class WorkerPool {
  private workers: Map<string, WorkerEngine> = new Map();
  private reaperTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  public initialize(initialWorkerCount: number = 3) {
    if (this.isRunning) return;
    this.isRunning = true;

    // Spin up default worker instances
    const workerNames = [
      { id: 'worker-alpha-01', name: 'Node Worker [Alpha-1]', queues: '*' as const },
      { id: 'worker-beta-02', name: 'Node Worker [Beta-2]', queues: '*' as const },
      { id: 'worker-gamma-03', name: 'Node Worker [Gamma-3]', queues: '*' as const },
    ];

    for (let i = 0; i < Math.min(initialWorkerCount, workerNames.length); i++) {
      const wConf = workerNames[i];
      this.spawnWorker(wConf.id, wConf.name, 4, wConf.queues);
    }

    // Start Stale Worker Reaper loop (runs every 4 seconds)
    this.reaperTimer = setInterval(() => {
      this.reapStaleWorkers();
    }, 4000);
  }

  public spawnWorker(
    id: string,
    name: string,
    concurrencyLimit: number = 4,
    assignedQueues: string[] | '*' = '*'
  ): WorkerEngine {
    if (this.workers.has(id)) {
      const existing = this.workers.get(id)!;
      existing.start();
      return existing;
    }

    const worker = new WorkerEngine({
      id,
      name,
      concurrencyLimit,
      assignedQueues,
      pollIntervalMs: 600,
      heartbeatIntervalMs: 3000,
      heartbeatTimeoutMs: 10000, // 10s timeout
    });

    worker.start();
    this.workers.set(id, worker);
    return worker;
  }

  public async terminateWorker(id: string, graceful: boolean = true): Promise<boolean> {
    const worker = this.workers.get(id);
    if (!worker) {
      db.deleteWorker(id);
      return true;
    }

    await worker.stop(graceful);
    this.workers.delete(id);
    db.deleteWorker(id);
    return true;
  }

  public pauseWorker(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.pause();
    }
  }

  public resumeWorker(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.resume();
    }
  }

  public reapStaleWorkers(): { staleWorkers: Worker[]; recoveredJobIds: string[] } {
    return db.handleStaleWorkers();
  }

  public async shutdownAll(graceful: boolean = true) {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }

    const stopPromises = Array.from(this.workers.values()).map(w => w.stop(graceful));
    await Promise.all(stopPromises);
    this.workers.clear();
    this.isRunning = false;
  }

  public getActiveWorkerCount(): number {
    return this.workers.size;
  }

  public getWorker(id: string): WorkerEngine | undefined {
    return this.workers.get(id);
  }

  public getAllWorkers(): WorkerEngine[] {
    return Array.from(this.workers.values());
  }
}

export const workerPool = new WorkerPool();
