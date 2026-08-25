/**
 * Job Execution & Logs Router
 */

import { Router, Response } from 'express';
import { db } from '../../db/database.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';

export const executionRouter = Router();

// GET /api/executions (or /api/jobs/:id/executions)
executionRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const jobId = req.query.jobId as string | undefined;
  const executions = db.listExecutions(jobId);
  return res.json({ executions });
});

// GET /api/executions/:id
executionRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const execution = db.getExecution(req.params.id);
  if (!execution) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution record not found' } });
  }
  return res.json({ execution });
});
