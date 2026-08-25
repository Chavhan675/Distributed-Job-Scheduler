/**
 * Distributed Rate Limiting Middleware
 * 
 * Powered by Redis sliding / fixed window counters.
 * Supports IP-based and User-based rate limiting tiers with HTTP 429 responses.
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../redis/redis.service.ts';
import { AuthenticatedRequest } from './auth.ts';

export interface RateLimitOptions {
  windowSeconds?: number;
  maxRequests?: number;
  keyPrefix?: string;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowSeconds = options.windowSeconds || 60;
  const maxRequests = options.maxRequests || 120; // 120 req / minute
  const prefix = options.keyPrefix || 'ratelimit';

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Identify client by user ID or IP
    const clientIdentifier = req.user?.id || req.ip || req.socket.remoteAddress || 'anonymous';
    const rateLimitKey = `${prefix}:${clientIdentifier}`;

    try {
      const result = await redis.incrementRateLimit(rateLimitKey, maxRequests, windowSeconds);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

      if (!result.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());

        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit of ${maxRequests} requests per ${windowSeconds}s exceeded. Please retry after ${retryAfterSeconds} seconds.`,
            retryAfterSeconds,
          },
        });
      }

      next();
    } catch (err) {
      // In case of rate limiter error, fail-open to avoid taking down APIs
      console.error('[RATE-LIMITER] Failed to evaluate rate limit:', err);
      next();
    }
  };
}
