/**
 * Distributed Job Scheduler - Domain Event Bus
 * 
 * Manages domain event broadcasting across:
 * - Local in-memory DB event store
 * - Redis Pub/Sub distributed channel
 * - Real-Time Server-Sent Events (SSE) / WebSocket clients for live dashboard push
 */

import { Response } from 'express';
import { db } from '../db/database.ts';
import { redis } from '../redis/redis.service.ts';
import { JobEvent, JobEventType } from '../../types.ts';

class DomainEventBus {
  private sseClients: Set<Response> = new Set();

  constructor() {
    // Subscribe to Redis pub/sub channel to relay distributed events to local SSE clients
    redis.subscribe('events:scheduler', (message: string) => {
      try {
        const event: JobEvent = JSON.parse(message);
        this.broadcastToSSEClients(event);
      } catch (err) {
        console.error('[EVENT-BUS] Failed to relay Redis event:', err);
      }
    });
  }

  /**
   * Publishes a domain event across DB, Redis, and connected SSE clients
   */
  public async publish(
    eventType: JobEventType,
    options: {
      jobId?: string | null;
      queueId?: string | null;
      workerId?: string | null;
      correlationId?: string | null;
      payload?: Record<string, any>;
      message: string;
    }
  ): Promise<JobEvent> {
    const event: JobEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType,
      jobId: options.jobId || null,
      queueId: options.queueId || null,
      workerId: options.workerId || null,
      correlationId: options.correlationId || null,
      timestamp: new Date().toISOString(),
      payload: options.payload || {},
      message: options.message,
    };

    // 1. Save event to DB audit store
    db.saveJobEvent(event);

    // 2. Publish to Redis Pub/Sub channel
    await redis.publish('events:scheduler', event);

    return event;
  }

  // SSE Client Management for Real-time Dashboard Updates
  public registerSSEClient(res: Response): () => void {
    this.sseClients.add(res);

    // Send initial connected handshake
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    const cleanup = () => {
      this.sseClients.delete(res);
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);
    return cleanup;
  }

  private broadcastToSSEClients(event: JobEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.sseClients.size;
  }
}

export const eventBus = new DomainEventBus();
