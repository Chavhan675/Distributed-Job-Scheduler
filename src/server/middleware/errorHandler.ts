/**
 * Structured Error Handling Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    path: string;
  };
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl || req.url;

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload failed schema validation',
        details: err.issues.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
        timestamp,
        path,
      },
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const code = err.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');
  const message = err.message || 'An unexpected internal server error occurred';

  console.error(`[API ERROR ${statusCode}] ${req.method} ${path}:`, err);

  return res.status(statusCode).json({
    error: {
      code,
      message,
      details: err.details || undefined,
      timestamp,
      path,
    },
  });
}
