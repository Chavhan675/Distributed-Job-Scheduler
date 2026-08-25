# System Design Decisions & Engineering Trade-Offs

This document details the architectural decisions, trade-offs, and design rationale chosen during the implementation of the **Distributed Job Scheduler**.

---

## 1. PostgreSQL Row-Level Locking (`FOR UPDATE SKIP LOCKED`) vs. Redis / External Queues

### Decision:
Use PostgreSQL with `SELECT ... FOR UPDATE SKIP LOCKED` inside explicit ACID transactions.

### Rationale:
- **Zero Distributed Inconsistency**: Traditional setups with Redis + relational databases suffer from dual-write problems where Redis claims a job but the primary database transaction fails or crashes.
- **ACID Guarantees**: Job status, execution history, and worker lease assignments are committed in a single atomic transaction.
- **Lock-Free Polling Throughput**: `SKIP LOCKED` instructs PostgreSQL not to wait for rows currently locked by other concurrent transactions, but instead skip directly to the next unlocked row. This yields high concurrent throughput without deadlocks.

---

## 2. Worker Polling with Adaptive Backoff vs. Push WebSockets

### Decision:
Worker nodes utilize autonomous periodic polling with adaptive intervals (1.5s active, backing off to 3s when idle).

### Rationale:
- **Worker Autonomy**: Decoupled worker pull models scale elastically. New worker containers can spin up and begin polling immediately without requiring dynamic routing table registrations or central push dispatchers.
- **Natural Backpressure**: A worker only polls when its own local concurrency slots are available. If a worker node is saturated, it stops polling, naturally preventing container out-of-memory crashes.

---

## 3. Worker Heartbeat Telemetry & Stale Worker Reaper

### Decision:
Workers write a lightweight heartbeat timestamp every 3 seconds. A central background supervisory process reaps workers silent for >10 seconds.

### Rationale:
- **Resilience to Hard Crashes**: If a worker node suffers a kernel panic, OOM kill, or network severance, it cannot execute graceful shutdown handlers.
- **Automated Lease Reclamation**: The Reaper transitions uncompleted jobs back to `QUEUED` or `RETRY_PENDING` so remaining healthy workers continue processing without manual operator intervention.

---

## 4. Idempotency Key Semantics

### Decision:
Optional client-provided `idempotency_key` with strict unique constraint validation.

### Rationale:
- **Network Retry Protection**: If a client submits a payment or email job, loses network connectivity, and retries the HTTP POST, the database rejects the duplicate submission and returns the existing job ID.
- **At-Least-Once Delivery**: The scheduler guarantees *at-least-once* execution semantics. The combination of scheduler-level idempotency keys and task payload idempotency guarantees end-to-end exactly-once business outcomes.

---

## 5. Retry Policies with Full Jitter

### Decision:
Provide three retry strategies: **Fixed**, **Linear**, and **Exponential** with randomized jitter.

### Formula:
$$\text{Delay} = \min(\text{MaxDelay}, \text{InitialDelay} \times \text{Multiplier}^{\text{Attempt} - 1}) + \text{RandomJitter}$$

### Rationale:
- **Preventing Thundering Herd**: When an external downstream service experiences a brief outage, thousands of jobs fail simultaneously. Without randomized jitter, all retries would fire at the exact same second, causing repeated cascading outages.
