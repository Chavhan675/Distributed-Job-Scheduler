/**
 * Distributed Job Scheduler - Main Full-Stack Application Server
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { seedDatabase } from './src/server/db/seed.ts';
import { db } from './src/server/db/database.ts';
import { redis } from './src/server/redis/redis.service.ts';
import { workerPool } from './src/server/worker/WorkerPool.ts';
import { schedulerService } from './src/server/modules/job/scheduler.service.ts';
import { requestLogger } from './src/server/middleware/logger.ts';
import { rateLimit } from './src/server/middleware/rateLimiter.ts';
import { errorHandler } from './src/server/middleware/errorHandler.ts';

// Import route controllers
import { authRouter } from './src/server/modules/auth/auth.controller.ts';
import { projectRouter } from './src/server/modules/project/project.controller.ts';
import { queueRouter } from './src/server/modules/queue/queue.controller.ts';
import { jobRouter } from './src/server/modules/job/job.controller.ts';
import { workerRouter } from './src/server/modules/worker/worker.controller.ts';
import { dlqRouter } from './src/server/modules/dlq/dlq.controller.ts';
import { executionRouter } from './src/server/modules/execution/execution.controller.ts';
import { metricsRouter } from './src/server/modules/metrics/metrics.controller.ts';
import { testRouter } from './src/server/tests/test.controller.ts';
import { eventRouter } from './src/server/events/event.controller.ts';

async function bootstrap() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  // Initialize DB & Seed
  seedDatabase();

  // Start Worker Fleet & Cron Scheduler
  workerPool.initialize(3);
  schedulerService.start(1000);

  // ==========================================
  // DEEP HEALTH & READINESS PROBES
  // ==========================================

  const getSystemHealth = () => {
    const activeWorkers = workerPool.getActiveWorkerCount();
    const redisStatus = redis.getStatus();
    const metrics = db.getSystemMetrics();

    const isHealthy = activeWorkers > 0 && !!metrics;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'Distributed Job Scheduler Engine',
      version: '2.4.0',
      uptimeSeconds: Math.floor(process.uptime()),
      components: {
        database: { status: 'healthy', totalJobs: metrics.totalJobs, queues: db.listQueues().length },
        workers: { status: activeWorkers > 0 ? 'healthy' : 'unhealthy', activeCount: activeWorkers, totalWorkers: workerPool.getAllWorkers().length },
        redis: { status: redisStatus.connected ? 'healthy' : 'degraded', ...redisStatus },
        scheduler: { status: 'healthy', pollIntervalMs: 1000 },
      },
    };
  };

  app.get('/health', (req, res) => res.json(getSystemHealth()));
  app.get('/ready', (req, res) => {
    const health = getSystemHealth();
    if (health.status === 'healthy') {
      res.json({ ready: true, ...health });
    } else {
      res.status(503).json({ ready: false, ...health });
    }
  });
  app.get('/live', (req, res) => res.json({ live: true, timestamp: new Date().toISOString() }));
  app.get('/api/health', (req, res) => res.json(getSystemHealth()));

  // Rate Limiter for REST APIs
  app.use('/api', rateLimit({ windowSeconds: 60, maxRequests: 300 }));

  // REST API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/queues', queueRouter);
  app.use('/api/jobs', jobRouter);
  app.use('/api/workers', workerRouter);
  app.use('/api/dlq', dlqRouter);
  app.use('/api/executions', executionRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/events', eventRouter);
  app.use('/api/tests', testRouter);

  // 404 handler for all unmatched /api routes
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Global Error Handler for API
  app.use('/api', errorHandler);
  app.use(errorHandler);

  // Vite Frontend Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`[SYSTEM] Received ${signal}. Draining workers and shutting down gracefully...`);
    schedulerService.stop();
    await workerPool.shutdownAll(true);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DISTRIBUTED JOB SCHEDULER] Running on http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal bootstrapping error:', err);
  process.exit(1);
});
