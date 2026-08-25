/**
 * Metrics & Observability Router
 */

import { Router, Response } from 'express';
import { db } from '../../db/database.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';

export const metricsRouter = Router();

// GET /api/metrics/system
metricsRouter.get('/system', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const metrics = db.getSystemMetrics();
  return res.json({ metrics });
});

// GET /api/metrics/queues
metricsRouter.get('/queues', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const queues = db.listQueues();
  const stats = queues.map(q => db.getQueueStatistics(q.id)).filter(Boolean);
  return res.json({ stats });
});
