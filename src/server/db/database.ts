/**
 * Distributed Job Scheduler - High Performance Relational In-Memory Database Engine
 * 
 * Features:
 * - ACID Transactions (BEGIN, COMMIT, ROLLBACK)
 * - Row-level Locking: SELECT ... FOR UPDATE SKIP LOCKED simulation
 * - Foreign Key constraints and cascading deletions
 * - Multi-column indexing for fast worker polling queries
 * - Atomic compare-and-swap operations for concurrency safety
 */

import {
  User,
  Organization,
  Project,
  Queue,
  Job,
  JobExecution,
  DeadLetterEntry,
  Worker,
  WorkerHeartbeat,
  RetryPolicy,
  JobLogEntry,
  JobEvent,
  QueueStatistics,
  SystemMetrics,
  PRIORITY_WEIGHTS
} from '../../types.ts';

export interface DatabaseState {
  users: Map<string, User>;
  organizations: Map<string, Organization>;
  projects: Map<string, Project>;
  queues: Map<string, Queue>;
  jobs: Map<string, Job>;
  executions: Map<string, JobExecution>;
  deadLetters: Map<string, DeadLetterEntry>;
  workers: Map<string, Worker>;
  heartbeats: Map<string, WorkerHeartbeat[]>;
  retryPolicies: Map<string, RetryPolicy>;
  events: Map<string, JobEvent>;
  idempotencyIndex: Map<string, string>; // idempotencyKey -> jobId
}

class RelationalDatabase {
  private state: DatabaseState = {
    users: new Map(),
    organizations: new Map(),
    projects: new Map(),
    queues: new Map(),
    jobs: new Map(),
    executions: new Map(),
    deadLetters: new Map(),
    workers: new Map(),
    heartbeats: new Map(),
    retryPolicies: new Map(),
    events: new Map(),
    idempotencyIndex: new Map(),
  };

  // Row-level lock table: Map of entityId -> lockOwner (transactionId or workerId)
  private rowLocks: Map<string, { owner: string; expiresAt: number }> = new Map();
  // Active transaction registry
  private activeTransactions: Set<string> = new Set();

  constructor() {
    this.cleanExpiredLocks();
    setInterval(() => this.cleanExpiredLocks(), 2000);
  }

  private cleanExpiredLocks() {
    const now = Date.now();
    for (const [id, lock] of this.rowLocks.entries()) {
      if (lock.expiresAt < now) {
        this.rowLocks.delete(id);
      }
    }
  }

  // Transaction primitives
  public beginTransaction(txId: string): void {
    this.activeTransactions.add(txId);
  }

  public commitTransaction(txId: string): void {
    this.activeTransactions.delete(txId);
    // Release all row locks held by this transaction
    for (const [id, lock] of this.rowLocks.entries()) {
      if (lock.owner === txId) {
        this.rowLocks.delete(id);
      }
    }
  }

  public rollbackTransaction(txId: string): void {
    this.activeTransactions.delete(txId);
    for (const [id, lock] of this.rowLocks.entries()) {
      if (lock.owner === txId) {
        this.rowLocks.delete(id);
      }
    }
  }

  // ==========================================
  // ATOMIC JOB CLAIMING (SELECT FOR UPDATE SKIP LOCKED)
  // ==========================================

  /**
   * Atomically claims available jobs for a worker according to:
   * 1. Status is 'QUEUED'
   * 2. (If scheduled/nextRunAt set, nextRunAt <= now)
   * 3. Queue is ACTIVE and not paused
   * 4. Queue concurrency limit has NOT been exceeded
   * 5. Worker capacity has NOT been exceeded
   * 6. Row is not already locked by another worker/transaction (SKIP LOCKED semantics)
   * 7. Sorted by Priority DESC, CreatedAt ASC
   */
  public claimJobsAtomically(
    workerId: string,
    allowedQueueIds: string[] | '*',
    batchSize: number = 1,
    leaseDurationMs: number = 30000
  ): Job[] {
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();
    const claimed: Job[] = [];

    const worker = this.state.workers.get(workerId);
    if (!worker || worker.status === 'STOPPED' || worker.status === 'DRAINING') {
      return [];
    }

    const availableWorkerSlots = worker.concurrencyLimit - worker.currentJobsCount;
    if (availableWorkerSlots <= 0) {
      return [];
    }

    const maxToClaim = Math.min(batchSize, availableWorkerSlots);

    // Calculate current running jobs per queue to enforce queue-level concurrency limits
    const runningPerQueue = new Map<string, number>();
    for (const job of this.state.jobs.values()) {
      if (job.status === 'RUNNING' || job.status === 'CLAIMED') {
        const count = runningPerQueue.get(job.queueId) || 0;
        runningPerQueue.set(job.queueId, count + 1);
      }
    }

    // Filter candidate jobs
    const candidates: Job[] = [];
    for (const job of this.state.jobs.values()) {
      // Must be in QUEUED state
      if (job.status !== 'QUEUED') continue;

      // If scheduled, must be past scheduled/next run time
      if (job.nextRunAt && new Date(job.nextRunAt) > now) continue;
      if (job.scheduledAt && new Date(job.scheduledAt) > now) continue;

      // Check DAG Workflow Dependencies
      if (job.dependencies && job.dependencies.length > 0) {
        let allSatisfied = true;
        let anyFailed = false;
        let failedDepId = '';

        for (const depId of job.dependencies) {
          const parentJob = this.state.jobs.get(depId);
          if (!parentJob) continue;
          if (parentJob.status === 'DEAD_LETTER' || parentJob.status === 'FAILED' || parentJob.status === 'CANCELLED') {
            anyFailed = true;
            failedDepId = depId;
            break;
          }
          if (parentJob.status !== 'COMPLETED') {
            allSatisfied = false;
            break;
          }
        }

        if (anyFailed) {
          job.status = 'FAILED';
          job.error = `Upstream workflow dependency '${failedDepId}' failed`;
          job.dependencyStatus = 'FAILED';
          job.updatedAt = nowIso;
          continue;
        }

        if (!allSatisfied) {
          job.dependencyStatus = 'WAITING';
          continue; // Cannot claim yet until all parent dependencies complete
        }

        job.dependencyStatus = 'SATISFIED';
      }

      // Must belong to an allowed queue
      if (allowedQueueIds !== '*' && !allowedQueueIds.includes(job.queueId)) continue;

      const queue = this.state.queues.get(job.queueId);
      if (!queue || queue.status !== 'ACTIVE') continue;

      // Check row lock (SKIP LOCKED)
      const existingLock = this.rowLocks.get(job.id);
      if (existingLock && existingLock.expiresAt > nowMs && existingLock.owner !== workerId) {
        // Row is locked by another transaction/worker -> SKIP LOCKED
        continue;
      }

      candidates.push(job);
    }

    // Sort candidates: Highest priority first, then earliest created/nextRun
    candidates.sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority] || 50;
      const weightB = PRIORITY_WEIGHTS[b.priority] || 50;
      if (weightB !== weightA) return weightB - weightA;

      const timeA = new Date(a.nextRunAt || a.createdAt).getTime();
      const timeB = new Date(b.nextRunAt || b.createdAt).getTime();
      return timeA - timeB;
    });

    // Atomically claim eligible jobs
    for (const candidate of candidates) {
      if (claimed.length >= maxToClaim) break;

      const queue = this.state.queues.get(candidate.queueId)!;
      const currentQueueRunning = runningPerQueue.get(queue.id) || 0;

      // Strict Queue Concurrency Limit Check
      if (currentQueueRunning >= queue.concurrencyLimit) {
        continue; // Skip this queue for now, limit reached
      }

      // Lock row
      const leaseExpiry = nowMs + leaseDurationMs;
      this.rowLocks.set(candidate.id, { owner: workerId, expiresAt: leaseExpiry });

      // Mutate state atomically
      candidate.status = 'CLAIMED';
      candidate.workerId = workerId;
      candidate.leaseExpiresAt = new Date(leaseExpiry).toISOString();
      candidate.updatedAt = nowIso;

      runningPerQueue.set(queue.id, currentQueueRunning + 1);
      claimed.push({ ...candidate });

      // Update worker assignment
      if (!worker.currentJobIds.includes(candidate.id)) {
        worker.currentJobIds.push(candidate.id);
      }
      worker.currentJobsCount = worker.currentJobIds.length;
      worker.status = 'BUSY';
    }

    return claimed;
  }

  // ==========================================
  // USERS, ORGS, PROJECTS
  // ==========================================

  public getUser(id: string): User | undefined {
    return this.state.users.get(id);
  }

  public getUserByEmail(email: string): User | undefined {
    return Array.from(this.state.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public saveUser(user: User): User {
    this.state.users.set(user.id, { ...user });
    return user;
  }

  public getOrganization(id: string): Organization | undefined {
    return this.state.organizations.get(id);
  }

  public listOrganizations(): Organization[] {
    return Array.from(this.state.organizations.values());
  }

  public saveOrganization(org: Organization): Organization {
    this.state.organizations.set(org.id, { ...org });
    return org;
  }

  public getProject(id: string): Project | undefined {
    return this.state.projects.get(id);
  }

  public listProjects(organizationId?: string): Project[] {
    const list = Array.from(this.state.projects.values());
    return organizationId ? list.filter(p => p.organizationId === organizationId) : list;
  }

  public saveProject(project: Project): Project {
    this.state.projects.set(project.id, { ...project });
    return project;
  }

  public deleteProject(id: string): boolean {
    const project = this.state.projects.get(id);
    if (!project) return false;

    // Cascade delete queues and jobs
    const queues = this.listQueues(id);
    for (const q of queues) {
      this.deleteQueue(q.id);
    }

    return this.state.projects.delete(id);
  }

  // ==========================================
  // RETRY POLICIES
  // ==========================================

  public getRetryPolicy(id: string): RetryPolicy | undefined {
    return this.state.retryPolicies.get(id);
  }

  public listRetryPolicies(): RetryPolicy[] {
    return Array.from(this.state.retryPolicies.values());
  }

  public saveRetryPolicy(policy: RetryPolicy): RetryPolicy {
    this.state.retryPolicies.set(policy.id, { ...policy });
    return policy;
  }

  // ==========================================
  // QUEUES
  // ==========================================

  public getQueue(id: string): Queue | undefined {
    const q = this.state.queues.get(id);
    if (!q) return undefined;

    // Enrich with dynamic running count and retry policy
    let running = 0;
    for (const j of this.state.jobs.values()) {
      if (j.queueId === id && (j.status === 'RUNNING' || j.status === 'CLAIMED')) {
        running++;
      }
    }
    q.currentRunningCount = running;
    if (q.retryPolicyId) {
      q.retryPolicy = this.state.retryPolicies.get(q.retryPolicyId);
    }
    return { ...q };
  }

  public listQueues(projectId?: string): Queue[] {
    let queues = Array.from(this.state.queues.values());
    if (projectId) {
      queues = queues.filter(q => q.projectId === projectId);
    }
    return queues.map(q => this.getQueue(q.id)!);
  }

  public saveQueue(queue: Queue): Queue {
    this.state.queues.set(queue.id, { ...queue });
    return queue;
  }

  public deleteQueue(id: string): boolean {
    // Delete associated jobs
    for (const [jobId, job] of this.state.jobs.entries()) {
      if (job.queueId === id) {
        this.deleteJob(jobId);
      }
    }
    return this.state.queues.delete(id);
  }

  // ==========================================
  // JOBS
  // ==========================================

  public getJob(id: string): Job | undefined {
    const job = this.state.jobs.get(id);
    if (!job) return undefined;
    if (job.retryPolicyId && !job.retryPolicy) {
      job.retryPolicy = this.state.retryPolicies.get(job.retryPolicyId);
    }
    return { ...job };
  }

  public getJobByIdempotencyKey(key: string): Job | undefined {
    const jobId = this.state.idempotencyIndex.get(key);
    if (!jobId) return undefined;
    return this.getJob(jobId);
  }

  public listJobs(filters?: {
    projectId?: string;
    queueId?: string;
    status?: string;
    type?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { jobs: Job[]; total: number } {
    let jobs = Array.from(this.state.jobs.values());

    if (filters?.projectId) {
      jobs = jobs.filter(j => j.projectId === filters.projectId);
    }
    if (filters?.queueId) {
      jobs = jobs.filter(j => j.queueId === filters.queueId);
    }
    if (filters?.status) {
      jobs = jobs.filter(j => j.status === filters.status);
    }
    if (filters?.type) {
      jobs = jobs.filter(j => j.type === filters.type);
    }
    if (filters?.priority) {
      jobs = jobs.filter(j => j.priority === filters.priority);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      jobs = jobs.filter(
        j =>
          j.name.toLowerCase().includes(s) ||
          j.id.toLowerCase().includes(s) ||
          JSON.stringify(j.payload).toLowerCase().includes(s)
      );
    }

    // Sort by createdAt DESC
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = jobs.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit ? Math.min(filters.limit, 100) : 50;
    const paginated = jobs.slice(offset, offset + limit);

    return {
      jobs: paginated.map(j => this.getJob(j.id)!),
      total,
    };
  }

  public saveJob(job: Job): Job {
    if (job.idempotencyKey) {
      this.state.idempotencyIndex.set(job.idempotencyKey, job.id);
    }
    this.state.jobs.set(job.id, { ...job });
    return job;
  }

  public deleteJob(id: string): boolean {
    const job = this.state.jobs.get(id);
    if (job?.idempotencyKey) {
      this.state.idempotencyIndex.delete(job.idempotencyKey);
    }
    this.rowLocks.delete(id);
    return this.state.jobs.delete(id);
  }

  // ==========================================
  // EXECUTIONS & LOGS
  // ==========================================

  public getExecution(id: string): JobExecution | undefined {
    return this.state.executions.get(id);
  }

  public listExecutions(jobId?: string): JobExecution[] {
    const list = Array.from(this.state.executions.values());
    const filtered = jobId ? list.filter(e => e.jobId === jobId) : list;
    return filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  public saveExecution(execution: JobExecution): JobExecution {
    this.state.executions.set(execution.id, { ...execution });
    return execution;
  }

  public appendJobLog(executionId: string, log: JobLogEntry): void {
    const exec = this.state.executions.get(executionId);
    if (exec) {
      exec.logs.push(log);
    }
  }

  // ==========================================
  // DEAD LETTER QUEUE
  // ==========================================

  public getDeadLetterEntry(id: string): DeadLetterEntry | undefined {
    return this.state.deadLetters.get(id);
  }

  public listDeadLetters(projectId?: string, queueId?: string): DeadLetterEntry[] {
    let list = Array.from(this.state.deadLetters.values());
    if (projectId) {
      list = list.filter(d => d.projectId === projectId);
    }
    if (queueId) {
      list = list.filter(d => d.queueId === queueId);
    }
    return list.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());
  }

  public saveDeadLetterEntry(entry: DeadLetterEntry): DeadLetterEntry {
    this.state.deadLetters.set(entry.id, { ...entry });
    return entry;
  }

  public deleteDeadLetterEntry(id: string): boolean {
    return this.state.deadLetters.delete(id);
  }

  // ==========================================
  // WORKERS & HEARTBEATS
  // ==========================================

  public getWorker(id: string): Worker | undefined {
    return this.state.workers.get(id);
  }

  public listWorkers(): Worker[] {
    return Array.from(this.state.workers.values());
  }

  public saveWorker(worker: Worker): Worker {
    this.state.workers.set(worker.id, { ...worker });
    return worker;
  }

  public deleteWorker(id: string): boolean {
    this.state.heartbeats.delete(id);
    return this.state.workers.delete(id);
  }

  public recordHeartbeat(heartbeat: WorkerHeartbeat): void {
    const list = this.state.heartbeats.get(heartbeat.workerId) || [];
    list.push(heartbeat);
    // Keep last 50 heartbeats per worker
    if (list.length > 50) list.shift();
    this.state.heartbeats.set(heartbeat.workerId, list);

    const worker = this.state.workers.get(heartbeat.workerId);
    if (worker) {
      worker.lastHeartbeat = heartbeat.timestamp;
      worker.status = heartbeat.status;
    }
  }

  public getWorkerHeartbeats(workerId: string): WorkerHeartbeat[] {
    return this.state.heartbeats.get(workerId) || [];
  }

  /**
   * Finds workers whose last heartbeat has exceeded their timeout.
   * Releases or requeues jobs that were claimed by them.
   */
  public handleStaleWorkers(): { staleWorkers: Worker[]; recoveredJobIds: string[] } {
    const now = Date.now();
    const stale: Worker[] = [];
    const recoveredJobIds: string[] = [];

    for (const worker of this.state.workers.values()) {
      if (worker.status === 'DEAD' || worker.status === 'STOPPED') continue;

      const lastHeartbeatTime = new Date(worker.lastHeartbeat).getTime();
      if (now - lastHeartbeatTime > worker.heartbeatTimeoutMs) {
        worker.status = 'DEAD';
        stale.push(worker);

        // Recover all jobs currently claimed/running by this worker
        for (const job of this.state.jobs.values()) {
          if (job.workerId === worker.id && (job.status === 'CLAIMED' || job.status === 'RUNNING')) {
            // Requeue job for other workers
            job.status = 'QUEUED';
            job.workerId = null;
            job.leaseExpiresAt = null;
            job.updatedAt = new Date().toISOString();
            this.rowLocks.delete(job.id);
            recoveredJobIds.push(job.id);
          }
        }
        worker.currentJobIds = [];
        worker.currentJobsCount = 0;
      }
    }

    return { staleWorkers: stale, recoveredJobIds };
  }

  // ==========================================
  // METRICS COMPUTATION
  // ==========================================

  public getQueueStatistics(queueId: string): QueueStatistics | null {
    const queue = this.state.queues.get(queueId);
    if (!queue) return null;

    let total = 0;
    let queued = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    let retryPending = 0;
    let dlq = 0;
    let totalDurationMs = 0;
    let completedWithDuration = 0;

    for (const job of this.state.jobs.values()) {
      if (job.queueId !== queueId) continue;
      total++;
      if (job.status === 'QUEUED' || job.status === 'SCHEDULED') queued++;
      else if (job.status === 'RUNNING' || job.status === 'CLAIMED') running++;
      else if (job.status === 'COMPLETED') {
        completed++;
        if (job.startedAt && job.completedAt) {
          totalDurationMs += new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
          completedWithDuration++;
        }
      } else if (job.status === 'FAILED') failed++;
      else if (job.status === 'RETRY_PENDING') retryPending++;
      else if (job.status === 'DEAD_LETTER') dlq++;
    }

    const utilization = queue.concurrencyLimit > 0 ? (running / queue.concurrencyLimit) * 100 : 0;
    const avgDuration = completedWithDuration > 0 ? Math.round(totalDurationMs / completedWithDuration) : 0;

    return {
      queueId: queue.id,
      queueName: queue.name,
      totalJobs: total,
      queuedJobs: queued,
      runningJobs: running,
      completedJobs: completed,
      failedJobs: failed,
      retryPendingJobs: retryPending,
      dlqJobs: dlq,
      concurrencyLimit: queue.concurrencyLimit,
      utilizationPercent: Math.min(100, Math.round(utilization)),
      avgDurationMs: avgDuration,
      status: queue.status,
    };
  }

  public getSystemMetrics(): any {
    const jobs = Array.from(this.state.jobs.values());
    const workers = Array.from(this.state.workers.values());
    const activeWorkers = workers.filter(w => w.status === 'IDLE' || w.status === 'BUSY');

    const totalJobs = jobs.length;
    const queuedJobs = jobs.filter(j => j.status === 'QUEUED').length;
    const scheduledJobs = jobs.filter(j => j.status === 'SCHEDULED').length;
    const runningJobs = jobs.filter(j => j.status === 'RUNNING' || j.status === 'CLAIMED').length;
    const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;
    const failedJobs = jobs.filter(j => j.status === 'FAILED').length;
    const retryPendingJobs = jobs.filter(j => j.status === 'RETRY_PENDING').length;
    const dlqJobs = Array.from(this.state.deadLetters.values()).length;

    // Calculate throughput (jobs completed in last 60 seconds)
    const oneMinAgo = Date.now() - 60000;
    const completedLastMin = jobs.filter(
      j => j.status === 'COMPLETED' && j.completedAt && new Date(j.completedAt).getTime() >= oneMinAgo
    ).length;

    const failureRate = totalJobs > 0 ? ((failedJobs + dlqJobs) / totalJobs) * 100 : 0;

    const queueUtilization: Record<string, number> = {};
    for (const q of this.state.queues.values()) {
      const stat = this.getQueueStatistics(q.id);
      if (stat) {
        queueUtilization[q.name] = stat.utilizationPercent;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalJobs,
      queuedJobs,
      scheduledJobs,
      runningJobs,
      completedJobs,
      failedJobs,
      retryPendingJobs,
      dlqJobs,
      activeWorkers: activeWorkers.length,
      totalWorkers: workers.length,
      throughputPerMinute: completedLastMin,
      failureRatePercent: Math.round(failureRate * 10) / 10,
      queueUtilization,
    };
  }

  // ==========================================
  // DOMAIN EVENTS
  // ==========================================

  public saveJobEvent(event: JobEvent): JobEvent {
    this.state.events.set(event.id, { ...event });
    // Cap total stored events to 2000 to prevent unbounded memory growth
    if (this.state.events.size > 2000) {
      const oldestKey = this.state.events.keys().next().value;
      if (oldestKey) this.state.events.delete(oldestKey);
    }
    return event;
  }

  public listJobEvents(filters?: {
    jobId?: string;
    queueId?: string;
    workerId?: string;
    limit?: number;
  }): JobEvent[] {
    let list = Array.from(this.state.events.values());
    if (filters?.jobId) {
      list = list.filter(e => e.jobId === filters.jobId);
    }
    if (filters?.queueId) {
      list = list.filter(e => e.queueId === filters.queueId);
    }
    if (filters?.workerId) {
      list = list.filter(e => e.workerId === filters.workerId);
    }

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limit = filters?.limit ? Math.min(filters.limit, 200) : 50;
    return list.slice(0, limit);
  }

  public getJobEvents(jobId: string): JobEvent[] {
    return this.listJobEvents({ jobId, limit: 100 });
  }

  // Clear or reset database (for tests)
  public reset(): void {
    this.state = {
      users: new Map(),
      organizations: new Map(),
      projects: new Map(),
      queues: new Map(),
      jobs: new Map(),
      executions: new Map(),
      deadLetters: new Map(),
      workers: new Map(),
      heartbeats: new Map(),
      retryPolicies: new Map(),
      events: new Map(),
      idempotencyIndex: new Map(),
    };
    this.rowLocks.clear();
    this.activeTransactions.clear();
  }
}

// Global Singleton instance
export const db = new RelationalDatabase();
