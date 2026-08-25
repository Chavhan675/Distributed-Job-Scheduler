/**
 * Job Management Router & Controller
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/database.ts';
import { Job, JobType, JobPriority, JobStatus } from '../../../types.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { SchedulerService } from './scheduler.service.ts';
import { eventBus } from '../../events/event.bus.ts';

export const jobRouter = Router();

const createJobSchema = z.object({
  queueId: z.string(),
  name: z.string().min(1),
  type: z.enum(['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH']).optional(),
  priority: z.enum(['LOW', 'DEFAULT', 'HIGH', 'CRITICAL']).optional(),
  payload: z.record(z.string(), z.any()).optional(),
  scheduledAt: z.string().optional(), // ISO date string
  cronExpression: z.string().optional(),
  delaySeconds: z.number().int().min(1).optional(),
  retryPolicyId: z.string().optional(),
  maxRetries: z.number().int().min(0).max(20).optional(),
  idempotencyKey: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
});

const createBatchJobSchema = z.object({
  queueId: z.string(),
  batchName: z.string().min(1),
  priority: z.enum(['LOW', 'DEFAULT', 'HIGH', 'CRITICAL']).optional(),
  items: z.array(z.record(z.string(), z.any())).min(1).max(100),
  retryPolicyId: z.string().optional(),
});

// GET /api/jobs
jobRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { queueId, projectId, status, type, priority, search, limit, offset } = req.query;

  const result = db.listJobs({
    queueId: queueId as string,
    projectId: projectId as string,
    status: status as string,
    type: type as string,
    priority: priority as string,
    search: search as string,
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0,
  });

  return res.json(result);
});

// POST /api/jobs (Immediate, Delayed, Scheduled, Recurring, with DAG dependencies)
jobRouter.post('/', requireAuth, validateBody(createJobSchema), async (req: AuthenticatedRequest, res: Response) => {
  const {
    queueId,
    name,
    type = 'IMMEDIATE',
    priority,
    payload = {},
    scheduledAt,
    cronExpression,
    delaySeconds,
    retryPolicyId,
    maxRetries,
    idempotencyKey,
    dependencies,
    timeoutMs,
  } = req.body;

  const correlationId = req.correlationId || `corr_${Date.now()}`;

  // 1. Idempotency Check
  if (idempotencyKey) {
    const existingJob = db.getJobByIdempotencyKey(idempotencyKey);
    if (existingJob) {
      return res.status(200).json({
        job: existingJob,
        isDuplicate: true,
        message: 'Idempotent request: returning existing job',
      });
    }
  }

  const queue = db.getQueue(queueId);
  if (!queue) {
    return res.status(404).json({ error: { code: 'QUEUE_NOT_FOUND', message: 'Target queue does not exist' } });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  let status: JobStatus = 'QUEUED';
  let targetScheduledAt: string | null = null;
  let nextRunAt: string | null = null;

  // Handle DELAYED
  if (type === 'DELAYED') {
    status = 'SCHEDULED';
    const delayMs = (delaySeconds || 10) * 1000;
    targetScheduledAt = new Date(now.getTime() + delayMs).toISOString();
    nextRunAt = targetScheduledAt;
  }
  // Handle SCHEDULED
  else if (type === 'SCHEDULED') {
    status = 'SCHEDULED';
    targetScheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : new Date(now.getTime() + 60000).toISOString();
    nextRunAt = targetScheduledAt;
  }
  // Handle RECURRING (Cron)
  else if (type === 'RECURRING') {
    if (!cronExpression) {
      return res.status(400).json({ error: { code: 'MISSING_CRON', message: 'cronExpression is required for RECURRING jobs' } });
    }
    status = 'SCHEDULED';
    const nextCron = SchedulerService.getNextCronOccurrence(cronExpression);
    nextRunAt = nextCron.toISOString();
    targetScheduledAt = nextRunAt;
  }

  const job: Job = {
    id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    queueId,
    projectId: queue.projectId,
    name,
    type: type as JobType,
    priority: (priority as JobPriority) || queue.priority || 'DEFAULT',
    status,
    payload,
    scheduledAt: targetScheduledAt,
    cronExpression: cronExpression || null,
    nextRunAt,
    idempotencyKey: idempotencyKey || null,
    correlationId,
    timeoutMs: timeoutMs || 30000,
    dependencies: dependencies && dependencies.length > 0 ? dependencies : undefined,
    dependencyStatus: dependencies && dependencies.length > 0 ? 'WAITING' : undefined,
    attempts: 0,
    maxRetries: maxRetries !== undefined ? maxRetries : (queue.retryPolicy?.maxRetries ?? 3),
    retryPolicyId: retryPolicyId || queue.retryPolicyId || null,
    retryHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.saveJob(job);

  // Publish domain event
  await eventBus.publish(status === 'SCHEDULED' ? 'JOB_SCHEDULED' : 'JOB_CREATED', {
    jobId: job.id,
    queueId: job.queueId,
    correlationId: job.correlationId,
    payload: { name: job.name, type: job.type, priority: job.priority },
    message: `Job '${job.name}' registered into queue '${queue.name}'`,
  });

  return res.status(201).json({ job, isDuplicate: false });
});

// POST /api/jobs/batch (Submit a collection of jobs atomically)
jobRouter.post('/batch', requireAuth, validateBody(createBatchJobSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { queueId, batchName, priority, items, retryPolicyId } = req.body;
  const queue = db.getQueue(queueId);
  if (!queue) {
    return res.status(404).json({ error: { code: 'QUEUE_NOT_FOUND', message: 'Target queue does not exist' } });
  }

  const batchId = `batch-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const createdJobs: Job[] = [];
  const correlationId = req.correlationId || `corr_batch_${Date.now()}`;

  for (let i = 0; i < items.length; i++) {
    const itemPayload = items[i];
    const job: Job = {
      id: `job-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
      queueId,
      projectId: queue.projectId,
      name: `${batchName} [#${i + 1}/${items.length}]`,
      type: 'BATCH',
      priority: (priority as JobPriority) || queue.priority || 'DEFAULT',
      status: 'QUEUED',
      payload: itemPayload,
      batchId,
      correlationId,
      attempts: 0,
      maxRetries: queue.retryPolicy?.maxRetries ?? 3,
      retryPolicyId: retryPolicyId || queue.retryPolicyId || null,
      retryHistory: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.saveJob(job);
    createdJobs.push(job);

    await eventBus.publish('JOB_CREATED', {
      jobId: job.id,
      queueId: job.queueId,
      correlationId,
      payload: { batchId, itemIndex: i + 1 },
      message: `Batch job '${job.name}' created`,
    });
  }

  return res.status(201).json({
    batchId,
    totalCreated: createdJobs.length,
    jobs: createdJobs,
  });
});

// GET /api/jobs/:id
jobRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  const executions = db.listExecutions(job.id);
  const events = db.getJobEvents(job.id);
  return res.json({ job, executions, events });
});

// GET /api/jobs/:id/events
jobRouter.get('/:id/events', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  const events = db.getJobEvents(job.id);
  return res.json({ jobId: job.id, events, count: events.length });
});

// POST /api/jobs/:id/retry (Manual Retry from UI/API)
jobRouter.post('/:id/retry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  job.status = 'QUEUED';
  job.error = null;
  job.workerId = null;
  job.leaseExpiresAt = null;
  job.nextRunAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();

  db.saveJob(job);

  await eventBus.publish('JOB_RETRY_SCHEDULED', {
    jobId: job.id,
    queueId: job.queueId,
    correlationId: job.correlationId,
    message: `Job '${job.name}' manually requeued by operator`,
  });

  return res.json({ job, message: 'Job requeued for execution' });
});

// POST /api/jobs/:id/cancel
jobRouter.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  if (job.status === 'COMPLETED') {
    return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Completed jobs cannot be cancelled' } });
  }

  job.status = 'CANCELLED';
  job.workerId = null;
  job.leaseExpiresAt = null;
  job.updatedAt = new Date().toISOString();

  db.saveJob(job);

  await eventBus.publish('JOB_CANCELLED', {
    jobId: job.id,
    queueId: job.queueId,
    correlationId: job.correlationId,
    message: `Job '${job.name}' cancelled`,
  });

  return res.json({ job, message: 'Job successfully cancelled' });
});
