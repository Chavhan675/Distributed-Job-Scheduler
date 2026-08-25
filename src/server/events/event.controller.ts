/**
 * Events Controller & Real-Time Stream Endpoint
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/database.ts';
import { eventBus } from './event.bus.ts';

export const eventRouter = Router();

// GET /api/events - List historical events
eventRouter.get('/', (req: Request, res: Response) => {
  const { jobId, queueId, workerId, limit } = req.query;

  const events = db.listJobEvents({
    jobId: jobId as string,
    queueId: queueId as string,
    workerId: workerId as string,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });

  res.json({ events, count: events.length });
});

// GET /api/events/stream - Real-time SSE event stream for Dashboard
eventRouter.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  eventBus.registerSSEClient(res);
});
