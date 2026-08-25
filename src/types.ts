/**
 * Distributed Job Scheduler - Global Types & Schemas
 */

export type JobStatus =
  | 'QUEUED'
  | 'SCHEDULED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'RETRY_PENDING'
  | 'FAILED'
  | 'CANCELLED'
  | 'DEAD_LETTER';

export type JobType = 'IMMEDIATE' | 'DELAYED' | 'SCHEDULED' | 'RECURRING' | 'BATCH';

export type JobPriority = 'LOW' | 'DEFAULT' | 'HIGH' | 'CRITICAL';

export const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  CRITICAL: 100,
  HIGH: 75,
  DEFAULT: 50,
  LOW: 25,
};

export type RetryStrategy = 'FIXED' | 'LINEAR' | 'EXPONENTIAL';

export type WorkerStatus = 'IDLE' | 'BUSY' | 'PAUSED' | 'DRAINING' | 'DEAD' | 'STOPPED';

export type QueueStatus = 'ACTIVE' | 'PAUSED' | 'DRAINING';

export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER' | 'VIEWER' | 'ENGINEER' | 'OPERATOR';

export type JobEventType =
  | 'JOB_CREATED'
  | 'JOB_SCHEDULED'
  | 'JOB_CLAIMED'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'JOB_RETRY_SCHEDULED'
  | 'JOB_MOVED_TO_DLQ'
  | 'JOB_CANCELLED'
  | 'DEPENDENCY_SATISFIED'
  | 'WORKER_REGISTERED'
  | 'WORKER_HEARTBEAT'
  | 'WORKER_OFFLINE';

export interface JobEvent {
  id: string;
  eventType: JobEventType;
  jobId?: string | null;
  queueId?: string | null;
  workerId?: string | null;
  correlationId?: string | null;
  timestamp: string;
  payload?: Record<string, any>;
  message: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: RetryStrategy;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier?: number;
  createdAt: string;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  priority: JobPriority;
  concurrencyLimit: number;
  currentRunningCount: number;
  status: QueueStatus;
  retryPolicyId?: string;
  retryPolicy?: RetryPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  queueId: string;
  projectId: string;
  name: string;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  payload: Record<string, any>;
  result?: Record<string, any> | null;
  error?: string | null;
  scheduledAt?: string | null;
  cronExpression?: string | null;
  nextRunAt?: string | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  timeoutMs?: number | null;
  dependencies?: string[]; // Parent Job IDs that must complete before this job can run
  dependencyStatus?: 'WAITING' | 'READY' | 'SATISFIED' | 'FAILED';
  workerId?: string | null;
  leaseExpiresAt?: string | null;
  attempts: number;
  maxRetries: number;
  retryPolicyId?: string | null;
  retryPolicy?: RetryPolicy | null;
  retryHistory: RetryRecord[];
  parentJobId?: string | null;
  batchId?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
}

export interface RetryRecord {
  attempt: number;
  error: string;
  attemptedAt: string;
  nextRetryAt: string;
  strategy: RetryStrategy;
  delayMs: number;
  workerId?: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  workerId: string;
  attemptNumber: number;
  status: 'SUCCESS' | 'FAILURE' | 'RUNNING';
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
  metadata?: Record<string, any>;
  logs: JobLogEntry[];
}

export interface JobLogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  data?: any;
}

export interface DeadLetterEntry {
  id: string;
  jobId: string;
  queueId: string;
  projectId: string;
  jobName: string;
  payload: Record<string, any>;
  totalAttempts: number;
  failureReason: string;
  finalError: string;
  failedAt: string;
  lastWorkerId?: string | null;
  requeuedAt?: string | null;
  requeuedJobId?: string | null;
}

export interface Worker {
  id: string;
  name: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  concurrencyLimit: number;
  currentJobsCount: number;
  totalJobsProcessed: number;
  successfulJobs: number;
  failedJobs: number;
  startedAt: string;
  lastHeartbeat: string;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  assignedQueues: string[]; // Queue IDs or '*' for all
  currentJobIds: string[];
}

export interface WorkerHeartbeat {
  workerId: string;
  timestamp: string;
  status: WorkerStatus;
  currentJobsCount: number;
  memoryUsageMb: number;
  cpuLoadPercent: number;
}

export interface QueueStatistics {
  queueId: string;
  queueName: string;
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  retryPendingJobs: number;
  dlqJobs: number;
  concurrencyLimit: number;
  utilizationPercent: number;
  avgDurationMs: number;
  status: QueueStatus;
}

export interface SystemMetrics {
  timestamp: string;
  totalJobs: number;
  queuedJobs: number;
  scheduledJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  retryPendingJobs: number;
  dlqJobs: number;
  activeWorkers: number;
  totalWorkers: number;
  throughputPerMinute: number;
  failureRatePercent: number;
  avgDurationMs: number;
  queueUtilization: Record<string, number>;
}

export interface ConcurrencyTestRun {
  id: string;
  timestamp: string;
  concurrencyWorkers: number;
  totalJobs: number;
  queueId: string;
  durationMs: number;
  claimedJobs: number;
  completedJobs: number;
  duplicateClaimCount: number;
  errors: string[];
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED';
  throughputJobsPerSec: number;
}
