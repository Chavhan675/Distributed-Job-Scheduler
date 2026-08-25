/**
 * Automated Testing & Concurrency Lab Router
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TestRunner } from './testRunner.ts';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';

export const testRouter = Router();

const stressTestSchema = z.object({
  workerCount: z.number().int().min(1).max(10).optional(),
  jobCount: z.number().int().min(5).max(100).optional(),
  queueConcurrencyLimit: z.number().int().min(1).max(20).optional(),
});

// POST /api/tests/run-all
testRouter.post('/run-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await TestRunner.runAllTests();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: { code: 'TEST_RUN_ERROR', message: error.message } });
  }
});

// POST /api/tests/stress-concurrency
testRouter.post('/stress-concurrency', requireAuth, validateBody(stressTestSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workerCount = 4, jobCount = 30, queueConcurrencyLimit = 8 } = req.body;
    const result = await TestRunner.runConcurrencyStressTest(workerCount, jobCount, queueConcurrencyLimit);
    return res.json({ result });
  } catch (error: any) {
    return res.status(500).json({ error: { code: 'STRESS_TEST_ERROR', message: error.message } });
  }
});
