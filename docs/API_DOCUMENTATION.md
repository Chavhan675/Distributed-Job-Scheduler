# REST API Reference & Specifications

Complete API reference for the **Distributed Job Scheduler** platform.

Base URL: `http://localhost:3000/api`

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Register a new administrator or developer user account.

**Request Body:**
```json
{
  "email": "engineer@example.com",
  "password": "SecurePassword123!",
  "name": "Alex Mercer"
}
```

**Response (201 Created):**
```json
{
  "user": {
    "id": "usr_99812",
    "email": "engineer@example.com",
    "name": "Alex Mercer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### `POST /api/auth/login`
Authenticate with email and password to obtain a JWT token.

**Request Body:**
```json
{
  "email": "engineer@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "usr_99812",
    "email": "engineer@example.com",
    "name": "Alex Mercer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 2. Jobs Management Endpoints

### `POST /api/jobs`
Enqueue an immediate, delayed, scheduled, or recurring task.

**Headers:**
`Authorization: Bearer <JWT_TOKEN>`

**Request Body (Immediate Job):**
```json
{
  "projectId": "proj_prod_01",
  "queueId": "q_payment_proc",
  "name": "Process Invoice #84920",
  "type": "IMMEDIATE",
  "priority": "HIGH",
  "payload": {
    "invoiceId": "inv_84920",
    "amount": 25000,
    "currency": "INR"
  },
  "maxRetries": 3,
  "idempotencyKey": "idem_inv_84920_attempt1"
}
```

**Request Body (Recurring Cron Job):**
```json
{
  "projectId": "proj_prod_01",
  "queueId": "q_reports",
  "name": "Generate Hourly Settlement Report",
  "type": "RECURRING",
  "cronExpression": "0 * * * *",
  "payload": {
    "reportType": "HOURLY_SETTLEMENT"
  }
}
```

**Response (201 Created):**
```json
{
  "job": {
    "id": "job_3981023",
    "status": "QUEUED",
    "priority": "HIGH",
    "attempts": 0,
    "createdAt": "2026-08-24T06:00:00.000Z"
  }
}
```

---

### `GET /api/jobs`
Query and filter jobs with pagination.

**Query Parameters:**
- `projectId` (string, optional)
- `queueId` (string, optional)
- `status` (string, optional): `QUEUED`, `RUNNING`, `COMPLETED`, `DEAD_LETTER`
- `priority` (string, optional): `CRITICAL`, `HIGH`, `DEFAULT`, `LOW`
- `search` (string, optional): Search by job name or ID
- `limit` (number, default: 50)
- `offset` (number, default: 0)

**Response (200 OK):**
```json
{
  "jobs": [
    {
      "id": "job_3981023",
      "name": "Process Invoice #84920",
      "queueId": "q_payment_proc",
      "status": "COMPLETED",
      "priority": "HIGH",
      "attempts": 1,
      "workerId": "worker-alpha",
      "durationMs": 420,
      "createdAt": "2026-08-24T06:00:00.000Z"
    }
  ],
  "total": 128
}
```

---

### `GET /api/jobs/:id`
Fetch complete details, execution logs, and step history for a job.

**Response (200 OK):**
```json
{
  "job": {
    "id": "job_3981023",
    "status": "COMPLETED",
    "executions": [
      {
        "id": "exec_01",
        "attemptNumber": 1,
        "workerId": "worker-alpha",
        "status": "SUCCESS",
        "durationMs": 420,
        "logs": [
          { "timestamp": "...", "level": "INFO", "message": "Initiating payment gateway..." },
          { "timestamp": "...", "level": "INFO", "message": "Settlement confirmed." }
        ]
      }
    ]
  }
}
```

---

### `POST /api/jobs/:id/retry`
Manually retry or requeue a failed job.

---

### `POST /api/jobs/:id/cancel`
Cancel an active or queued job.

---

## 3. Queue Endpoints

### `GET /api/queues`
List all provisioned queues with real-time active counts and limits.

### `POST /api/queues`
Create a new priority queue.

**Request Body:**
```json
{
  "projectId": "proj_prod_01",
  "name": "High Frequency Notifications",
  "priority": "HIGH",
  "concurrencyLimit": 15,
  "retryPolicyId": "pol_exp_standard"
}
```

### `POST /api/queues/:id/pause`
Pause all worker claiming on the specified queue.

### `POST /api/queues/:id/resume`
Resume claiming on the specified queue.

---

## 4. Worker & Cluster Endpoints

### `GET /api/workers`
List active worker nodes, current job load, and heartbeat timestamps.

### `POST /api/workers/reap-stale`
Manually trigger stale worker recovery scan.

---

## 5. DLQ & Metrics Endpoints

### `GET /api/dlq`
Retrieve quarantined dead-letter entries with stack traces and payloads.

### `POST /api/dlq/:id/retry`
Replay a DLQ job back into its target queue.

### `GET /api/metrics/system`
Cluster throughput, active worker count, CPU/Memory telemetry, and success/failure ratios.
