/**
 * Built-in Job Handlers & Task Execution Routines
 */

import { JobLogEntry } from '../../types.ts';

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  logs: JobLogEntry[];
}

export class JobExecutors {
  public static async execute(
    jobName: string,
    payload: Record<string, any>,
    attemptNumber: number
  ): Promise<ExecutionResult> {
    const logs: JobLogEntry[] = [];
    const addLog = (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) => {
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
      });
    };

    addLog('INFO', `Starting job execution: "${jobName}" (Attempt #${attemptNumber})`, { payload });

    // Simulate work duration (200ms to 1200ms)
    const simulatedWorkTime = payload.simulatedDurationMs || Math.floor(Math.random() * 400) + 200;
    await new Promise(r => setTimeout(r, Math.min(simulatedWorkTime, 2000)));

    // 1. Explicit Chaos / Failure Trigger (For testing retries & DLQ)
    if (payload.forceFail || payload.shouldFail) {
      const failReason = payload.failMessage || `Simulated failure on attempt #${attemptNumber}`;
      addLog('ERROR', `Task failed with forced exception: ${failReason}`);
      return {
        success: false,
        error: failReason,
        logs,
      };
    }

    // 2. Intermittent Transient Failure (Fail first 2 attempts, succeed on 3rd)
    if (payload.failUntilAttempt && attemptNumber < payload.failUntilAttempt) {
      const msg = `Transient network timeout on upstream service (attempt ${attemptNumber} < ${payload.failUntilAttempt})`;
      addLog('WARN', msg);
      return {
        success: false,
        error: msg,
        logs,
      };
    }

    // 3. Domain Specific Execution Handlers
    const lowerName = jobName.toLowerCase();

    if (lowerName.includes('email') || lowerName.includes('receipt') || lowerName.includes('alert')) {
      addLog('DEBUG', `Connecting to SMTP Mail Transport...`);
      addLog('INFO', `Rendered template for recipient: ${payload.to || 'user@example.com'}`);
      addLog('INFO', `Dispatched email. Status: DELIVERED (250 OK)`);
      return {
        success: true,
        result: {
          messageId: `msg_${Math.random().toString(36).substring(2, 10)}`,
          deliveredAt: new Date().toISOString(),
          recipient: payload.to || 'user@example.com',
        },
        logs,
      };
    }

    if (lowerName.includes('billing') || lowerName.includes('payment') || lowerName.includes('subscription')) {
      addLog('DEBUG', `Initiating payment gateway idempotent transaction...`);
      addLog('INFO', `Processing charge of $${payload.amountUsd || payload.amount || 99.0} for customer ${payload.customerId || 'cus_demo'}`);
      addLog('INFO', `Payment captured successfully via Stripe gateway.`);
      return {
        success: true,
        result: {
          chargeId: `ch_${Math.random().toString(36).substring(2, 12)}`,
          amountCaptured: payload.amountUsd || payload.amount || 99.0,
          currency: 'USD',
          status: 'succeeded',
        },
        logs,
      };
    }

    if (lowerName.includes('rollup') || lowerName.includes('analytics') || lowerName.includes('fraud')) {
      addLog('DEBUG', `Scanning telemetry records for window: ${payload.timeWindowMinutes || 60}m`);
      addLog('INFO', `Aggregated 14,280 clickstream events. Computed anomalies: 0.`);
      return {
        success: true,
        result: {
          processedRecords: 14280,
          anomalyScore: 0.02,
          completedAt: new Date().toISOString(),
        },
        logs,
      };
    }

    if (lowerName.includes('report') || lowerName.includes('export') || lowerName.includes('csv')) {
      addLog('DEBUG', `Querying database partitions for export...`);
      addLog('INFO', `Generated CSV buffer: 1.4 MB (4,820 rows).`);
      return {
        success: true,
        result: {
          fileUrl: `https://storage.internal/exports/${Math.random().toString(36).substring(2, 8)}.csv`,
          rowCount: 4820,
          sizeBytes: 1468000,
        },
        logs,
      };
    }

    // Default Generic Handler
    addLog('INFO', `Executed generic task payload successfully.`);
    return {
      success: true,
      result: {
        status: 'OK',
        processedAt: new Date().toISOString(),
        echoPayload: payload,
      },
      logs,
    };
  }
}
