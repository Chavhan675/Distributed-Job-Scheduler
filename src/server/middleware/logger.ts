/**
 * Structured Request Logger & Correlation ID Middleware
 */

import { Request, Response, NextFunction } from 'express';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      requestId?: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  req.correlationId = correlationId;
  req.requestId = requestId;

  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    // Keep logs clean, don't spam for Vite internal paths
    if (!req.url.startsWith('/@') && !req.url.startsWith('/src/')) {
      const log = {
        requestId,
        correlationId,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
      };
      if (res.statusCode >= 400) {
        console.warn(`[HTTP] ${log.method} ${log.path} -> ${log.statusCode} (${log.durationMs}ms) [Corr: ${correlationId}]`);
      }
    }
  });

  next();
}

