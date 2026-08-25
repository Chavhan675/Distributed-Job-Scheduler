/**
 * Seed initial database data with realistic entities for immediate exploration
 */

import { db } from './database.ts';
import { RetryPolicy, Organization, Project, Queue, Job, DeadLetterEntry, User } from '../../types.ts';

export function seedDatabase() {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Seed Default User
  const defaultUser: User = {
    id: 'user-admin-01',
    email: 'admin@distribjobs.internal',
    name: 'Akash Chavhan',
    role: 'ADMIN',
    organizationId: 'org-acme-01',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: nowIso,
  };
  db.saveUser(defaultUser);

  // 2. Seed Organization
  const defaultOrg: Organization = {
    id: 'org-acme-01',
    name: 'Acme Cloud Systems',
    slug: 'acme-cloud',
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: nowIso,
  };
  db.saveOrganization(defaultOrg);

  // 3. Seed Projects
  const project1: Project = {
    id: 'proj-payments',
    name: 'Core Payments & Billing',
    slug: 'core-payments',
    description: 'Transaction settlement, subscription webhooks, and invoice generation',
    organizationId: defaultOrg.id,
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: nowIso,
  };
  const project2: Project = {
    id: 'proj-analytics',
    name: 'Telemetry & Analytics Pipeline',
    slug: 'analytics-pipeline',
    description: 'Clickstream ingestion, daily metric rollups, and anomaly detection',
    organizationId: defaultOrg.id,
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedAt: nowIso,
  };
  db.saveProject(project1);
  db.saveProject(project2);

  // 4. Seed Retry Policies
  const policyExp: RetryPolicy = {
    id: 'policy-exponential',
    name: 'Exponential Backoff (Production Standard)',
    strategy: 'EXPONENTIAL',
    maxRetries: 4,
    initialDelayMs: 3000,
    maxDelayMs: 60000,
    multiplier: 2.0,
    createdAt: nowIso,
  };
  const policyLinear: RetryPolicy = {
    id: 'policy-linear',
    name: 'Linear Step Backoff',
    strategy: 'LINEAR',
    maxRetries: 3,
    initialDelayMs: 4000,
    maxDelayMs: 20000,
    multiplier: 1.0,
    createdAt: nowIso,
  };
  const policyFixed: RetryPolicy = {
    id: 'policy-fixed',
    name: 'Fixed 5-Second Delay',
    strategy: 'FIXED',
    maxRetries: 3,
    initialDelayMs: 5000,
    maxDelayMs: 15000,
    createdAt: nowIso,
  };
  db.saveRetryPolicy(policyExp);
  db.saveRetryPolicy(policyLinear);
  db.saveRetryPolicy(policyFixed);

  // 5. Seed Queues
  const queue1: Queue = {
    id: 'queue-critical-billing',
    projectId: project1.id,
    name: 'critical-billing-sync',
    description: 'High-priority financial webhook executions and Stripe sync',
    priority: 'CRITICAL',
    concurrencyLimit: 4,
    currentRunningCount: 0,
    status: 'ACTIVE',
    retryPolicyId: policyExp.id,
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: nowIso,
  };

  const queue2: Queue = {
    id: 'queue-email-notifications',
    projectId: project1.id,
    name: 'transactional-emails',
    description: 'Customer receipts, security alerts, and verification codes',
    priority: 'HIGH',
    concurrencyLimit: 6,
    currentRunningCount: 0,
    status: 'ACTIVE',
    retryPolicyId: policyLinear.id,
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: nowIso,
  };

  const queue3: Queue = {
    id: 'queue-analytics-rollup',
    projectId: project2.id,
    name: 'hourly-metric-rollup',
    description: 'Calculates rollups and writes to analytical data warehouse',
    priority: 'DEFAULT',
    concurrencyLimit: 3,
    currentRunningCount: 0,
    status: 'ACTIVE',
    retryPolicyId: policyFixed.id,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: nowIso,
  };

  const queue4: Queue = {
    id: 'queue-batch-exporter',
    projectId: project2.id,
    name: 'csv-report-exporter',
    description: 'Nightly CSV export and user-requested large data dumps',
    priority: 'LOW',
    concurrencyLimit: 2,
    currentRunningCount: 0,
    status: 'ACTIVE',
    retryPolicyId: policyFixed.id,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: nowIso,
  };

  db.saveQueue(queue1);
  db.saveQueue(queue2);
  db.saveQueue(queue3);
  db.saveQueue(queue4);

  // 6. Seed Sample Jobs
  const jobs: Job[] = [
    {
      id: 'job-seed-01',
      queueId: queue1.id,
      projectId: project1.id,
      name: 'Process Subscription Renewal #84920',
      type: 'IMMEDIATE',
      priority: 'CRITICAL',
      status: 'COMPLETED',
      payload: { customerId: 'cus_991823', amountUsd: 149.0, plan: 'enterprise_annual' },
      result: { invoiceId: 'inv_88291', status: 'paid', chargedAt: nowIso },
      attempts: 1,
      maxRetries: 4,
      retryPolicyId: policyExp.id,
      retryHistory: [],
      createdAt: new Date(Date.now() - 120000).toISOString(),
      updatedAt: new Date(Date.now() - 110000).toISOString(),
      startedAt: new Date(Date.now() - 118000).toISOString(),
      completedAt: new Date(Date.now() - 110000).toISOString(),
    },
    {
      id: 'job-seed-02',
      queueId: queue2.id,
      projectId: project1.id,
      name: 'Send Invoice PDF to user@corp.com',
      type: 'IMMEDIATE',
      priority: 'HIGH',
      status: 'COMPLETED',
      payload: { to: 'user@corp.com', templateId: 'invoice_receipt_v2', invoiceId: 'inv_88291' },
      result: { messageId: 'msg_9921783', deliveryTimeMs: 420 },
      attempts: 1,
      maxRetries: 3,
      retryPolicyId: policyLinear.id,
      retryHistory: [],
      createdAt: new Date(Date.now() - 90000).toISOString(),
      updatedAt: new Date(Date.now() - 85000).toISOString(),
      startedAt: new Date(Date.now() - 88000).toISOString(),
      completedAt: new Date(Date.now() - 85000).toISOString(),
    },
    {
      id: 'job-seed-03',
      queueId: queue3.id,
      projectId: project2.id,
      name: 'Hourly Fraud Risk Scoring Rollup',
      type: 'RECURRING',
      priority: 'DEFAULT',
      status: 'SCHEDULED',
      cronExpression: '0 * * * *',
      nextRunAt: new Date(Date.now() + 1800000).toISOString(),
      payload: { timeWindowMinutes: 60, threshold: 0.85 },
      attempts: 0,
      maxRetries: 3,
      retryPolicyId: policyFixed.id,
      retryHistory: [],
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: nowIso,
    },
    {
      id: 'job-seed-04',
      queueId: queue1.id,
      projectId: project1.id,
      name: 'Synchronize Chargeback Dispute #DP-9921',
      type: 'IMMEDIATE',
      priority: 'HIGH',
      status: 'QUEUED',
      payload: { disputeId: 'dp_992100', bankCode: 'CHASE_US', reason: 'unrecognized_charge' },
      attempts: 0,
      maxRetries: 4,
      retryPolicyId: policyExp.id,
      retryHistory: [],
      createdAt: new Date(Date.now() - 5000).toISOString(),
      updatedAt: nowIso,
    },
    {
      id: 'job-seed-05',
      queueId: queue2.id,
      projectId: project1.id,
      name: 'Dispatch Security Alert: New Login from Tokyo',
      type: 'IMMEDIATE',
      priority: 'HIGH',
      status: 'QUEUED',
      payload: { userId: 'usr_8821', ip: '133.242.18.91', location: 'Tokyo, Japan' },
      attempts: 0,
      maxRetries: 3,
      retryPolicyId: policyLinear.id,
      retryHistory: [],
      createdAt: new Date(Date.now() - 2000).toISOString(),
      updatedAt: nowIso,
    }
  ];

  for (const j of jobs) {
    db.saveJob(j);
  }

  // 7. Seed Sample Dead Letter Queue Entry
  const dlqEntry: DeadLetterEntry = {
    id: 'dlq-seed-01',
    jobId: 'job-failed-legacy-webhook',
    queueId: queue1.id,
    projectId: project1.id,
    jobName: 'Dispatch Webhook to https://broken-partner.api/v1/event',
    payload: { event: 'payment.success', payloadId: 'evt_991823' },
    totalAttempts: 5,
    failureReason: 'Connection timed out (ECONNREFUSED) after 5 retries with exponential backoff',
    finalError: 'FetchError: request to https://broken-partner.api/v1/event failed, reason: connect ECONNREFUSED 192.0.2.1:443',
    failedAt: new Date(Date.now() - 14400000).toISOString(),
    lastWorkerId: 'worker-node-alpha-1',
  };
  db.saveDeadLetterEntry(dlqEntry);
}
