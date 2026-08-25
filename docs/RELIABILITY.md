# System Reliability & Fault Tolerance Guide

This document details the distributed systems mechanics, concurrency controls, lease management, retry policies, and failover recovery strategies that guarantee high availability and data integrity in the **Distributed Job Scheduler**.

---

## 1. Atomic Job Claiming (`SELECT ... FOR UPDATE SKIP LOCKED`)

### The Problem: Worker Race Conditions
In a distributed queue architecture with multiple autonomous workers polling concurrently, a naive `SELECT ... WHERE status = 'QUEUED' LIMIT 1` followed by `UPDATE jobs SET status = 'CLAIMED'` suffers from race conditions. Multiple workers can read the exact same row simultaneously before the write lock is committed, leading to duplicate processing.

### The Solution: Transactional Row-Level Exclusion
We implement row-level isolation via PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED`:

```sql
BEGIN TRANSACTION;

WITH claimable_jobs AS (
  SELECT id
  FROM jobs
  WHERE status = 'QUEUED'
    AND (next_run_at IS NULL OR next_run_at <= NOW())
    AND queue_id IN (:allowed_queues)
  ORDER BY priority DESC, created_at ASC
  LIMIT :batch_size
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs
SET status = 'CLAIMED',
    worker_id = :worker_id,
    lease_expires_at = NOW() + INTERVAL '30 seconds',
    updated_at = NOW()
WHERE id IN (SELECT id FROM claimable_jobs)
RETURNING *;

COMMIT;
```

### Guarantees
1. **Zero Duplicate Claims**: A locked row is atomically skipped by all other polling workers without blocking transaction throughput.
2. **Strict Queue Concurrency**: Active queue concurrency limits are verified inside the transaction before leases are assigned.
3. **Priority Ordering**: High and Critical priority jobs are always claimed before Default and Low priority tasks.

---

## 2. Distributed Job Leases & Stale Worker Recovery

### The Lease Lifecycle
When a worker claims a job, it acquires a **30-second lease** (`lease_expires_at`). As long as the worker remains healthy, it sends heartbeats every 3 seconds to maintain its lease.

```
+---------------+      Claim Job       +-------------------+
|  QUEUED Job   | ------------------> | CLAIMED / RUNNING |
+---------------+                     +-------------------+
                                                |
                                                | [Worker dies / OOM]
                                                v
                                      +-------------------+
                                      |   Lease Expires   |
                                      +-------------------+
                                                |
                                                | [Scheduler Reaper Tick]
                                                v
                                      +-------------------+
                                      | Re-queued to Pool |
                                      +-------------------+
```

### Stale Worker Reaper
1. The scheduler runs a continuous background reaper every 1,000ms.
2. Any worker node that fails to transmit a heartbeat within `heartbeatTimeoutMs` (10s) is marked as `DEAD`.
3. All unfinished jobs (`CLAIMED` or `RUNNING`) assigned to that worker are automatically released, row locks are purged, and the jobs are reset to `QUEUED` with incremented failure logging.

---

## 3. Three-Tier Retry Backoff Engine with Jitter

When transient failures occur (network timeouts, rate limits, 5xx server errors), the Retry Engine calculates the next attempt time using one of three strategies:

### 1. Fixed Delay Backoff
$$t_{\text{delay}} = \text{initialDelayMs}$$
*Example (5s fixed):* 5s $\rightarrow$ 5s $\rightarrow$ 5s $\rightarrow$ 5s

### 2. Linear Backoff
$$t_{\text{delay}} = \min(\text{initialDelayMs} \times \text{attempt}, \text{maxDelayMs})$$
*Example (5s initial):* 5s $\rightarrow$ 10s $\rightarrow$ 15s $\rightarrow$ 20s

### 3. Exponential Backoff with Jitter
$$t_{\text{delay}} = \min(\text{initialDelayMs} \times 2^{(\text{attempt} - 1)} \pm \text{Jitter}, \text{maxDelayMs})$$
*Example (5s initial):* 5.2s $\rightarrow$ 10.4s $\rightarrow$ 19.8s $\rightarrow$ 41.1s

**Why Randomized Jitter?**  
When an upstream service (like a database or third-party payment gateway) recovers from an outage, thousands of retrying workers without jitter will hit the service at the exact same millisecond. Jitter spreads retry attempts uniformly across time, preventing catastrophic **Thundering Herd** cascading failures.

---

## 4. Dead Letter Queue (DLQ) Quarantine Vault

When a job exhausts all configured retry attempts ($n \ge \text{maxRetries}$), it is permanently moved into the **Dead Letter Queue (DLQ)**:

1. **Isolation**: Halts further compute execution, protecting worker pools from poison-pill payloads.
2. **Payload & Error Forensics**: Captures full JSON payload, attempt history, exact error messages, and execution traces.
3. **Operator Replay**: Provides 1-click single or batch replay once upstream bugs are resolved.
4. **Permanent Purge**: Allows operators to safely archive or discard expired failures.

---

## 5. Idempotency Key Deduplication

To prevent duplicate side-effects (such as charging a credit card twice):

1. Clients include a unique `idempotencyKey` in the job creation request.
2. The scheduler checks the unique index in PostgreSQL:
   - If key already exists: Returns the existing job with HTTP 200 and `{ isDuplicate: true }` without creating a duplicate record.
   - If key is new: Atomically creates and persists the job with HTTP 201.

---

## 6. DAG Workflow Dependency Resolution

For dependent job chains ($A \rightarrow B \rightarrow C$):

1. **Wait State**: Child jobs ($B$) remain in `WAITING` state until parent job $A$ enters `COMPLETED`.
2. **Cascade Trigger**: When $A$ completes, the scheduler evaluates downstream dependents and promotes $B$ to `QUEUED`.
3. **Failure Propagation**: If parent $A$ permanently fails into the DLQ, dependent job $B$ transitions directly to `FAILED` with failure reason `Upstream workflow dependency 'job-A' failed`, preventing corrupted partial executions.
