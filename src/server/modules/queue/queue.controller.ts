/**
 * Queue Management Router & Controller
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/database.ts';
import { Queue, JobPriority, RetryPolicy } from '../../../types.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';

export const queueRouter = Router();

const createQueueSchema = z.object({
  projectId: z.string(),
  name: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'DEFAULT', 'HIGH', 'CRITICAL']).optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  retryPolicyId: z.string().optional(),
});

const updateQueueSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'DEFAULT', 'HIGH', 'CRITICAL']).optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  retryPolicyId: z.string().optional(),
});

const createRetryPolicySchema = z.object({
  name: z.string().min(2),
  strategy: z.enum(['FIXED', 'LINEAR', 'EXPONENTIAL']),
  maxRetries: z.number().int().min(1).max(20),
  initialDelayMs: z.number().int().min(500),
  maxDelayMs: z.number().int().min(1000),
  multiplier: z.number().min(1).max(10).optional(),
});

// GET /api/queues/retry-policies
queueRouter.get('/retry-policies', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const policies = db.listRetryPolicies();
  return res.json({ policies });
});

// POST /api/queues/retry-policies
queueRouter.post('/retry-policies', requireAuth, validateBody(createRetryPolicySchema), (req: AuthenticatedRequest, res: Response) => {
  const policy: RetryPolicy = {
    id: `policy-${Date.now()}`,
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  db.saveRetryPolicy(policy);
  return res.status(201).json({ policy });
});

// GET /api/queues
queueRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  const queues = db.listQueues(projectId);
  return res.json({ queues });
});

// POST /api/queues
queueRouter.post('/', requireAuth, validateBody(createQueueSchema), (req: AuthenticatedRequest, res: Response) => {
  const { projectId, name, description, priority, concurrencyLimit, retryPolicyId } = req.body;

  const project = db.getProject(projectId);
  if (!project) {
    return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Referenced project does not exist' } });
  }

  const newQueue: Queue = {
    id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    projectId,
    name,
    description,
    priority: (priority as JobPriority) || 'DEFAULT',
    concurrencyLimit: concurrencyLimit || 5,
    currentRunningCount: 0,
    status: 'ACTIVE',
    retryPolicyId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.saveQueue(newQueue);
  return res.status(201).json({ queue: newQueue });
});

// GET /api/queues/:id
queueRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const queue = db.getQueue(req.params.id);
  if (!queue) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }
  return res.json({ queue });
});

// PUT /api/queues/:id
queueRouter.put('/:id', requireAuth, validateBody(updateQueueSchema), (req: AuthenticatedRequest, res: Response) => {
  const queue = db.getQueue(req.params.id);
  if (!queue) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }

  const { name, description, priority, concurrencyLimit, retryPolicyId } = req.body;
  if (name) queue.name = name;
  if (description !== undefined) queue.description = description;
  if (priority) queue.priority = priority;
  if (concurrencyLimit) queue.concurrencyLimit = concurrencyLimit;
  if (retryPolicyId !== undefined) queue.retryPolicyId = retryPolicyId;
  queue.updatedAt = new Date().toISOString();

  db.saveQueue(queue);
  return res.json({ queue });
});

// DELETE /api/queues/:id
queueRouter.delete('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const deleted = db.deleteQueue(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }
  return res.json({ success: true, message: 'Queue deleted' });
});

// POST /api/queues/:id/pause
queueRouter.post('/:id/pause', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const queue = db.getQueue(req.params.id);
  if (!queue) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }
  queue.status = 'PAUSED';
  queue.updatedAt = new Date().toISOString();
  db.saveQueue(queue);
  return res.json({ queue, message: 'Queue paused' });
});

// POST /api/queues/:id/resume
queueRouter.post('/:id/resume', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const queue = db.getQueue(req.params.id);
  if (!queue) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }
  queue.status = 'ACTIVE';
  queue.updatedAt = new Date().toISOString();
  db.saveQueue(queue);
  return res.json({ queue, message: 'Queue resumed' });
});

// GET /api/queues/:id/stats
queueRouter.get('/:id/stats', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const stats = db.getQueueStatistics(req.params.id);
  if (!stats) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }
  return res.json({ stats });
});
