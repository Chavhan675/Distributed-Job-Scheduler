/**
 * Retry Policy & Backoff Calculation Engine
 * 
 * Implements:
 * 1. FIXED DELAY: constant delay interval
 * 2. LINEAR BACKOFF: delay = initialDelay * attemptNumber (capped at maxDelay)
 * 3. EXPONENTIAL BACKOFF: delay = initialDelay * (multiplier ^ (attemptNumber - 1)) + jitter
 */

import { RetryPolicy, RetryStrategy, RetryRecord } from '../../../types.ts';

export interface RetryDelayCalculation {
  delayMs: number;
  nextRetryAt: Date;
  isExhausted: boolean;
}

export class RetryService {
  /**
   * Calculates the delay in milliseconds for a specific retry attempt.
   */
  public static calculateDelay(policy: RetryPolicy, attemptNumber: number): RetryDelayCalculation {
    if (attemptNumber > policy.maxRetries) {
      return {
        delayMs: 0,
        nextRetryAt: new Date(),
        isExhausted: true,
      };
    }

    let delayMs = policy.initialDelayMs;

    switch (policy.strategy) {
      case 'FIXED':
        delayMs = policy.initialDelayMs;
        break;

      case 'LINEAR':
        delayMs = policy.initialDelayMs * attemptNumber;
        break;

      case 'EXPONENTIAL':
        const multiplier = policy.multiplier && policy.multiplier > 1 ? policy.multiplier : 2.0;
        // initialDelay * (multiplier ^ (attempt - 1))
        delayMs = policy.initialDelayMs * Math.pow(multiplier, Math.max(0, attemptNumber - 1));
        // Add subtle 5-10% jitter to prevent thundering herd problem
        const jitter = (Math.random() * 0.1) * delayMs;
        delayMs = Math.round(delayMs + jitter);
        break;

      default:
        delayMs = policy.initialDelayMs;
    }

    // Clamp by maxDelayMs
    if (policy.maxDelayMs && delayMs > policy.maxDelayMs) {
      delayMs = policy.maxDelayMs;
    }

    const nextRetryAt = new Date(Date.now() + delayMs);

    return {
      delayMs,
      nextRetryAt,
      isExhausted: false,
    };
  }

  /**
   * Constructs a structured RetryRecord audit log.
   */
  public static createRetryRecord(
    attempt: number,
    error: string,
    policy: RetryPolicy,
    delayMs: number,
    nextRetryAt: Date,
    workerId?: string
  ): RetryRecord {
    return {
      attempt,
      error,
      attemptedAt: new Date().toISOString(),
      nextRetryAt: nextRetryAt.toISOString(),
      strategy: policy.strategy,
      delayMs,
      workerId,
    };
  }
}
