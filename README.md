# UptimeHub

> **Modern Website & API Uptime Monitoring Platform**  
> A scalable, reliable, and secure uptime monitoring service built with Express 5, React 19, BullMQ, Redis, PostgreSQL, and Prisma.

---

## 1. System Architecture

```
                          ┌───────────────────────────┐
                          │   Frontend (React 19)     │
                          │   Vite + Tailwind CSS v4  │
                          │   Recharts Analytics      │
                          └─────────────┬─────────────┘
                                        │ HTTP / REST
                                        ▼
                          ┌───────────────────────────┐
                          │   Backend API (Express 5) │
                          │   Zod Validation, JWT     │
                          │   Helmet, Pino Redaction  │
                          └──────┬──────────────┬─────┘
                                 │              │
                    Job Enqueue  │              │ State / CRUD
                                 ▼              ▼
        ┌────────────────────────────┐    ┌──────────────────────────┐
        │       Redis 7 (BullMQ)     │    │   PostgreSQL 16 (Prisma) │
        │  ├── check-queue           │    │  ├── User / Monitor      │
        │  └── notification-queue    │    │  ├── CheckResult         │
        └─────────────┬──────────────┘    │  ├── Incident            │
                      │                   │  └── Notification        │
                      │                   └─────────────▲────────────┘
        ┌─────────────┴──────────────┐                  │
        │                            │                  │
        ▼                            ▼                  │
┌──────────────────────────┐  ┌─────────────────────────┴┐
│  Check Worker Process    │  │ Notification Worker      │
│  SSRF Guard + Monotonic  │  │ Nodemailer HTML / Text   │
│  Incident State Machine  │  │ Idempotent Deliveries    │
└──────────────────────────┘  └──────────────────────────┘
```

### Core Architecture Highlights
- **Strict Separation of Concerns**: Outbound probes run completely asynchronously in decoupled worker processes (`monitor.worker.ts`) via Redis/BullMQ. The REST API never performs probe work directly.
- **SSRF Guard**: Pre-resolves DNS and rejects private IPv4/IPv6, loopbacks (`127.0.0.1`, `::1`), cloud metadata (`169.254.169.254`), carrier-grade NAT, and AWS/GCP internal ranges before any connection attempt.
- **Incident State Machine**: Deterministic transitions: `UP → SUSPECT → DOWN → RECOVERING → UP` with configurable consecutive thresholds ($k$ failures, $r$ recoveries). Database updates occur in single atomic PostgreSQL transactions.
- **Queue Separation & Non-blocking Dispatch**: Probe scheduling (`check-queue`) is strictly separated from alert dispatch (`notification-queue`). Slow or broken SMTP connections never stall or delay probe execution.
- **Idempotency**: Repeatable job keys (`monitor:<id>`), unique incident alert deduplication `(incidentId, type)`, and transactional locks prevent double alerting.

---

## 2. Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), TanStack Query, React Router v7, Recharts, Lucide Icons.
- **Backend**: Node.js 22, Express 5, TypeScript, Prisma ORM 6, BullMQ v5, Redis, PostgreSQL 16.
- **Testing**: Vitest, Supertest (89 passing unit, integration, and E2E tests).
- **Tooling & Orchestration**: Docker, Docker Compose, Nginx.

---

## 3. Quick Start with Docker (Single Command)

Launch the entire stack with a single command:

```bash
docker compose up --build
```

### Services Started:
| Service | Container Name | Port | Description |
|---|---|---|---|
| **Frontend** | `uptimehub-frontend` | `http://localhost:3000` | Web application (Nginx) |
| **API Server** | `uptimehub-api` | `http://localhost:4000` | Express REST API |
| **Worker (Probes)** | `uptimehub-worker-checks` | — | Background probe runner |
| **Worker (Alerts)** | `uptimehub-worker-notifications` | — | Alert email worker |
| **PostgreSQL** | `uptimehub-postgres` | `localhost:5433` | System of record |
| **Redis** | `uptimehub-redis` | `localhost:6379` | BullMQ message broker |

Open **`http://localhost:3000`** in your browser to get started!

---

## 4. Local Development Setup

### Prerequisites
- Node.js 20+ / 22+
- Docker & Docker Compose
- npm

### Step 1: Start Database & Cache
```bash
docker compose up -d postgres redis
```

### Step 2: Configure & Start Backend
```bash
cd backend
cp .env.example .env

# Install dependencies & run Prisma migrations
npm install
npx prisma migrate dev

# Run API server
npm run dev

# Run Workers (in separate terminals)
npm run worker                # Check probe worker
npm run worker:notifications # Notification worker
```

### Step 3: Configure & Start Frontend
```bash
cd frontend
cp .env.example .env

npm install
npm run dev
```

Visit `http://localhost:5173` to access the Vite dev server.

---

## 5. Testing

Run the full test suite (89 tests covering SSRF security, authentication, queues, incident state transitions, analytics, notifications, and end-to-end workflows):

```bash
cd backend
npm test
```

Typecheck and build checks:
```bash
# Backend
cd backend && npm run build

# Frontend
cd frontend && npm run build
```

---

## 6. REST API Reference (`/api/v1`)

All responses adhere to a consistent JSON envelope:
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

### Authentication
- `POST /api/v1/auth/register` — Create account (`email`, `password`, `name`)
- `POST /api/v1/auth/login` — Sign in and receive JWT token
- `GET /api/v1/auth/me` — Authenticated user profile

### Monitors
- `GET /api/v1/monitors` — List user's monitors with live status (`UP`, `SUSPECT`, `DOWN`, `RECOVERING`)
- `POST /api/v1/monitors` — Create and schedule new monitor
- `GET /api/v1/monitors/:id` — Monitor details
- `PATCH /api/v1/monitors/:id` — Update interval or thresholds
- `POST /api/v1/monitors/:id/pause` — Pause monitor (removes BullMQ job)
- `POST /api/v1/monitors/:id/resume` — Resume monitor (re-enqueues BullMQ job)
- `DELETE /api/v1/monitors/:id` — Delete monitor and clean up jobs
- `POST /api/v1/monitors/:id/check` — Immediate test probe trigger
- `GET /api/v1/monitors/:id/checks` — Recent check history
- `GET /api/v1/monitors/:id/uptime?range=24h|7d|30d` — Aggregated uptime %, average latency, p95 latency, and time-series buckets

### Incidents & Alerts
- `GET /api/v1/incidents?status=OPEN|RESOLVED` — List user incidents
- `GET /api/v1/incidents/:id` — Incident details
- `GET /api/v1/settings/notifications` — Get user notification preferences
- `PUT /api/v1/settings/notifications` — Update preferences (`emailEnabled`, `downtimeEnabled`, `recoveryEnabled`)

---

## 7. Security & Hardening Rules
1. **SSRF Guard**: Prohibits private networks, AWS/GCP metadata (`169.254.169.254`), loopbacks, and non-HTTP/HTTPS protocols.
2. **Strict Multi-Tenant Scoping**: All database queries filter by `req.user.id`.
3. **Log Hygiene**: Sensitive tokens, passwords, cookies, authorization headers, and response bodies are redacted automatically by Pino.
4. **Rate Limiting**: Auth endpoints protected via `express-rate-limit`.
5. **Account Quotas**: Default maximum of 50 monitors per account with interval boundaries (minimum 30 seconds).

---

## 8. License
ISC License &mdash; Created for UptimeHub.
