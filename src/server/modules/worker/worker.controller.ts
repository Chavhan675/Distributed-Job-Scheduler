/**
 * Worker Monitoring & Management Router
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/database.ts';
import { workerPool } from '../../worker/WorkerPool.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';

export const workerRouter = Router();

const spawnWorkerSchema = z.object({
  name: z.string().min(2),
  concurrencyLimit: z.number().int().min(1).max(20).optional(),
  assignedQueues: z.union([z.array(z.string()), z.literal('*')]).optional(),
});

// GET /api/workers
workerRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const workers = db.listWorkers();
  return res.json({ workers });
});

// POST /api/workers (Spawn a new worker process)
workerRouter.post('/', requireAuth, validateBody(spawnWorkerSchema), (req: AuthenticatedRequest, res: Response) => {
  const { name, concurrencyLimit = 4, assignedQueues = '*' } = req.body;
  const id = `worker-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  workerPool.spawnWorker(id, name, concurrencyLimit, assignedQueues);
  const worker = db.getWorker(id);

  return res.status(201).json({ worker, message: `Worker ${name} spawned successfully` });
});

// GET /api/workers/:id
workerRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const worker = db.getWorker(req.params.id);
  if (!worker) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Worker not found' } });
  }
  const heartbeats = db.getWorkerHeartbeats(req.params.id);
  return res.json({ worker, heartbeats });
});

// POST /api/workers/:id/pause
workerRouter.post('/:id/pause', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  workerPool.pauseWorker(req.params.id);
  const worker = db.getWorker(req.params.id);
  return res.json({ worker, message: 'Worker paused' });
});

// POST /api/workers/:id/resume
workerRouter.post('/:id/resume', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  workerPool.resumeWorker(req.params.id);
  const worker = db.getWorker(req.params.id);
  return res.json({ worker, message: 'Worker resumed' });
});

// DELETE /api/workers/:id
workerRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  await workerPool.terminateWorker(req.params.id, true);
  return res.json({ success: true, message: 'Worker terminated gracefully' });
});

// POST /api/workers/reap-stale (Trigger stale worker detection)
workerRouter.post('/reap-stale', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const result = workerPool.reapStaleWorkers();
  return res.json({
    staleWorkersCount: result.staleWorkers.length,
    recoveredJobsCount: result.recoveredJobIds.length,
    recoveredJobIds: result.recoveredJobIds,
    staleWorkers: result.staleWorkers,
  });
});
