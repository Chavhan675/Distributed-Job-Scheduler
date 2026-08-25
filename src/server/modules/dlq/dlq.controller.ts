/**
 * Dead Letter Queue (DLQ) Management Router & Controller
 */

import { Router, Response } from 'express';
import { db } from '../../db/database.ts';
import { Job } from '../../../types.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';

export const dlqRouter = Router();

// GET /api/dlq
dlqRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { projectId, queueId } = req.query;
  const entries = db.listDeadLetters(projectId as string, queueId as string);
  return res.json({ entries });
});

// GET /api/dlq/:id
dlqRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const entry = db.getDeadLetterEntry(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dead Letter entry not found' } });
  }
  return res.json({ entry });
});

// POST /api/dlq/:id/retry (Replay/Requeue from DLQ)
dlqRouter.post('/:id/retry', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const entry = db.getDeadLetterEntry(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dead Letter entry not found' } });
  }

  // Create a clean new job or reset original job
  const nowIso = new Date().toISOString();
  let job = db.getJob(entry.jobId);

  if (job) {
    job.status = 'QUEUED';
    job.attempts = 0;
    job.error = null;
    job.workerId = null;
    job.leaseExpiresAt = null;
    job.nextRunAt = nowIso;
    job.updatedAt = nowIso;
    db.saveJob(job);
  } else {
    // Re-create from DLQ metadata
    const queue = db.getQueue(entry.queueId);
    job = {
      id: `job-replayed-${Date.now()}`,
      queueId: entry.queueId,
      projectId: entry.projectId,
      name: `${entry.jobName} (Replayed from DLQ)`,
      type: 'IMMEDIATE',
      priority: queue?.priority || 'HIGH',
      status: 'QUEUED',
      payload: entry.payload,
      attempts: 0,
      maxRetries: 3,
      retryHistory: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.saveJob(job);
  }

  entry.requeuedAt = nowIso;
  entry.requeuedJobId = job.id;
  db.saveDeadLetterEntry(entry);

  return res.json({
    message: 'Job successfully requeued from Dead Letter Queue',
    job,
    entry,
  });
});

// DELETE /api/dlq/:id (Purge from DLQ)
dlqRouter.delete('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const deleted = db.deleteDeadLetterEntry(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dead Letter entry not found' } });
  }
  return res.json({ success: true, message: 'DLQ entry purged' });
});
