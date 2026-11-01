# AGENTS.md — UptimeHub Build Guide

> Read this file fully before writing any code. It is the single source of truth for how to build UptimeHub. Follow the phases in order. Do not skip ahead.

---

## 1. What You Are Building

**UptimeHub** is a website and API uptime-monitoring platform.

A logged-in user registers monitors (URL + interval + timeout). The system checks each URL on a schedule, stores every result, detects outages and recoveries, shows uptime and response-time history on a dashboard, and sends downtime/recovery e-mails.

**Core design idea:** the REST API must never do monitoring work. Scheduled checks run in separate **worker processes** fed by a **Redis/BullMQ queue**. Notifications run on a **second queue**. PostgreSQL is the system of record.

```
React Dashboard ──HTTPS──► Express API ──SQL──► PostgreSQL
                              │
                              ▼ (schedule / enqueue)
                        Redis + BullMQ ──► Monitor Worker ──► Monitored endpoints
                              │                  │
                              │                  └──► PostgreSQL (checks, incidents)
                              ▼
                      Notification Worker ──► SMTP
```

---

## 2. Tech Stack

### Frontend (`/frontend`)
| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework | React 18 |
| Build tool | Vite |
| Routing | React Router |
| Server state | TanStack Query (React Query) |
| Styling | Tailwind CSS |
| Charts | Recharts (or Chart.js) |
| HTTP client | Axios or `fetch` wrapper in one file |
| Forms/validation | React Hook Form + Zod |
| Realtime (later phase) | Socket.IO client |
| Testing | Vitest + React Testing Library |

### Backend (`/backend`)
| Concern | Choice |
|---|---|
| Runtime | Node.js 22 |
| Language | TypeScript (strict) |
| Web framework | Express |
| Dev runner | `tsx watch` |
| Database | PostgreSQL |
| ORM / migrations | Prisma |
| Queue | BullMQ |
| Queue store | Redis |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Validation | Zod |
| HTTP probing | `undici` or `axios` (with strict timeout) |
| E-mail | Nodemailer (SMTP) |
| Logging | pino |
| Security middleware | helmet, cors, express-rate-limit |
| Realtime (later phase) | Socket.IO |
| Metrics (later phase) | prom-client → Prometheus → Grafana |
| Testing | Vitest/Jest + Supertest |

### Infrastructure
Docker Compose (Postgres + Redis for dev; full stack later), Nginx for TLS in production, Playwright for end-to-end tests.

> **Before installing anything:** check each `package.json` first. Some of the above may already be present (the repo currently has a Vite React TS frontend and a Node 22 TS backend run with `tsx watch`). Do not reinstall or duplicate what exists. Add only what the current phase needs.

---

## 3. Repository Structure (Monolith, Two Parent Folders)

This is a **single monolith repository**. The root contains exactly **two application folders**: `frontend/` and `backend/`. Nothing else is an application.

```
uptimehub/
├── AGENTS.md                 # this file
├── README.md
├── docker-compose.yml        # postgres + redis (dev)
├── .gitignore
├── .env.example              # dummy values only (never commit real .env)
│
├── frontend/                 # ALL UI code lives here
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/           # route definitions + protected-route wrapper
│       ├── pages/            # Login, Register, Monitors, MonitorDetail, Incidents, Settings
│       ├── components/       # reusable UI (StatusBadge, UptimeCard, ResponseChart, forms)
│       ├── features/         # feature folders: auth/, monitors/, incidents/
│       ├── api/              # single API client + per-resource functions
│       ├── hooks/            # React Query hooks (useMonitors, useIncidents ...)
│       ├── types/            # shared TS types mirroring API responses
│       ├── utils/            # formatters (dates, uptime %, durations)
│       └── styles/
│
└── backend/                  # ALL server code lives here
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    └── src/
        ├── server.ts         # starts HTTP server only
        ├── app.ts            # builds Express app (testable, no listen)
        ├── config/           # env loading + Zod validation, constants
        ├── db/               # Prisma client singleton
        ├── queue/            # BullMQ connections, queue definitions, scheduler helpers
        ├── workers/
        │   ├── monitor.worker.ts        # runs checks
        │   └── notification.worker.ts   # sends e-mails
        ├── modules/
        │   ├── auth/         # routes, controller, service, schema
        │   ├── monitors/
        │   ├── checks/
        │   ├── incidents/    # incident state engine
        │   ├── notifications/
        │   └── analytics/    # uptime / latency aggregation
        ├── middleware/       # auth, error handler, rate limit, validation
        ├── security/         # SSRF guard, URL validation
        ├── utils/
        └── types/
```

### Separation rules (non-negotiable)

1. **All UI/browser logic goes in `frontend/`.** Components, pages, routing, forms, charts, client-side state, API client.
2. **All server logic goes in `backend/`.** Express routes, auth, database access, queues, workers, incident engine, notifications, SSRF protection.
3. **Frontend never touches the database, Redis, or SMTP.** It only talks to the backend through the REST API (and later Socket.IO).
4. **Backend never imports from `frontend/`, and `frontend/` never imports from `backend/`.** No shared source folder. If a type is needed on both sides, define it in each (types are small) — keep the API contract documented in Section 8.
5. **Each folder has its own `package.json`, `node_modules`, `tsconfig.json`, scripts and `.env`.** There is no root-level workspace tooling required.
6. **The root holds only docs, Docker config and ignore files.** Never put application code at the root.
7. **Never mix concerns inside the backend.** Routes parse/validate and call services; services hold business logic; only services/repositories touch Prisma. Workers call the same services — no duplicated logic.

---

## 4. Key Points to Remember

These are the decisions that matter most. Re-read them whenever unsure.

1. **API ≠ monitoring.** Express handlers never run checks. They only validate, read/write the DB, and add/remove scheduled jobs.
2. **PostgreSQL is the system of record.** Redis only coordinates jobs. Never store check history or incidents in Redis.
3. **Two failure types, never confuse them:**
   - *Endpoint failure* (timeout, DNS error, 500) = job **succeeded**, check result = **failed**. Store it. Do **not** retry at queue level.
   - *Job failure* (our code crashed, DB write failed) = retry with exponential back-off.
4. **Jobs can run twice.** Handlers must be idempotent. Use unique constraints and a single DB transaction for check insert + incident update.
5. **One repeatable BullMQ job per monitor**, with a stable job ID derived from the monitor ID (e.g. `monitor:<id>`). Interval change → replace job. Pause/delete → remove job. Resume → re-add job.
6. **Separate queues:** `check-queue` and `notification-queue`. A slow mail server must never delay a probe.
7. **Every outbound request has a hard timeout.** No exceptions.
8. **SSRF protection is mandatory** (Section 7). Users supply URLs; treat them as hostile.
9. **Every query is scoped to the authenticated user.** Check ownership on every monitor/check/incident read or write.
10. **All timestamps stored in UTC.** Convert to local time only in the UI.
11. **Measure latency with a monotonic clock** (`performance.now()` / `process.hrtime`), not `Date.now()` differences.
12. **Never log** passwords, tokens, headers, or response bodies.
13. **Validate all input with Zod** (body, params, query) and all env vars at startup. Fail fast on bad config.
14. **Build vertical slices.** Get one monitor → one check → one DB row working end-to-end *before* adding queues and advanced features.
15. **Do not build out-of-scope features** (multi-region probing, browser journeys, AI diagnosis, SMS/Slack, public status pages) until all phases below are done.

---

## 5. Domain Rules

### 5.1 Check result classification
A check is **successful** only if the request completes within `timeoutMs` **and** the status code is in the accepted range (default: 2xx).
Store `errorType` for failures: `TIMEOUT | DNS | CONNECTION | TLS | HTTP_STATUS | BLOCKED | UNKNOWN`.

### 5.2 Incident state machine
Per monitor, states: `UP → SUSPECT → DOWN → RECOVERING → UP`.

| From | Event | To | Action |
|---|---|---|---|
| UP | check fails | SUSPECT | fails = 1 |
| SUSPECT | check ok | UP | reset counters |
| SUSPECT | k-th consecutive failure | DOWN | open incident, enqueue **down** alert |
| DOWN | check ok | RECOVERING | oks = 1 |
| RECOVERING | check fails | DOWN | reset oks (no new incident) |
| RECOVERING | r-th consecutive success | UP | resolve incident, enqueue **recovery** alert |

Defaults: **k = 2**, **r = 2**. Make both configurable per monitor.
Incident `startedAt` = time of first failed check of the run; `resolvedAt` = time of first successful check of the recovery run. Duration = `resolvedAt − startedAt` (or `now` while open).
Write the check row, state change and incident row in **one transaction**.

### 5.3 Uptime
`uptime % = successful checks / valid checks × 100` (exclude paused periods). Label it as check-based. Show average and p95 response time over 24 h, 7 d, 30 d.

### 5.4 Defaults and limits
Default interval 60 s (min 30 s, enforced per account), default timeout 10 s (max 30 s), max monitors per account (e.g. 50), only `http`/`https`.

---

## 6. Data Model (Prisma)

| Model | Fields |
|---|---|
| **User** | id, name, email (unique), passwordHash, createdAt |
| **Monitor** | id, userId, name, url, method (GET), intervalSeconds, timeoutMs, failureThreshold (k), recoveryThreshold (r), isActive, currentStatus, consecutiveFailures, consecutiveSuccesses, createdAt, updatedAt |
| **CheckResult** | id, monitorId, statusCode?, responseTimeMs?, isUp, errorType?, errorMessage?, checkedAt |
| **Incident** | id, monitorId, startedAt, resolvedAt?, status (OPEN/RESOLVED), failureReason? |
| **NotificationPreference** | id, userId (unique), emailEnabled, downtimeEnabled, recoveryEnabled |
| **Notification** | id, incidentId, userId, type (DOWN/RECOVERED), channel (EMAIL), status (PENDING/SENT/FAILED), attempts, sentAt?, error? |

Required indexes/constraints:
- `CheckResult (monitorId, checkedAt)`
- `Incident (monitorId, status)`
- `Monitor (userId)`
- Unique `Notification (incidentId, type)` — prevents duplicate alerts.
- Only one OPEN incident per monitor (partial unique index or transactional guard).

---

## 7. Security Rules

**SSRF guard (`backend/src/security/`) — applied before every probe and on monitor create/update:**
1. Allow only `http:` and `https:`.
2. Resolve the hostname; **reject** loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, includes cloud metadata), multicast and reserved ranges — IPv4 **and** IPv6.
3. Connect to the **validated IP** (prevents DNS rebinding); re-validate at connection time.
4. **Disable redirects** in v1 (or validate every hop).
5. Cap response size, total time and connection time. Do not forward cookies or custom headers.
6. A blocked target is recorded as a failed check with `errorType = BLOCKED`.

**Other rules:** bcrypt for passwords (cost ≥ 10); JWT with expiry; rate-limit login/register and monitor creation; `helmet` + strict CORS (allow only the frontend origin); generic error messages to the client; no stack traces in production; secrets only via env vars.

---

## 8. REST API Contract (prefix `/api/v1`)

Consistent envelope: `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message" } }`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | no | Liveness (outside `/api/v1` is fine) |
| POST | `/auth/register` | no | Create account |
| POST | `/auth/login` | no | Return JWT |
| GET | `/auth/me` | yes | Current user |
| GET | `/monitors` | yes | List own monitors (with current status) |
| POST | `/monitors` | yes | Create + schedule |
| GET | `/monitors/:id` | yes | Monitor detail |
| PATCH | `/monitors/:id` | yes | Update (reschedule if interval changed) |
| POST | `/monitors/:id/pause` | yes | Pause + remove job |
| POST | `/monitors/:id/resume` | yes | Resume + re-add job |
| DELETE | `/monitors/:id` | yes | Delete + remove job |
| GET | `/monitors/:id/checks?page&limit&from&to` | yes | Paginated history |
| GET | `/monitors/:id/uptime?range=24h\|7d\|30d` | yes | Uptime %, avg & p95 latency |
| GET | `/incidents?monitorId&status` | yes | Incident list |
| GET/PUT | `/settings/notifications` | yes | Read/update preferences |

The frontend codes against this contract. If you change an endpoint, update this table in the same commit.

---

## 9. Build Phases (follow in order)

Each phase ends with a **Done when** check. Do not start the next phase until it passes. Commit after every phase.

### Phase 1 — Foundation
- Create `frontend/` (Vite + React + TS + Tailwind) and `backend/` (Node 22 + TS + Express) if not present.
- Backend: `app.ts` + `server.ts`, `GET /health`, env loader with Zod, pino logger, helmet, CORS, central error handler.
- Frontend: router shell, layout, API client file, `.env` with `VITE_API_URL`.
- Add `docker-compose.yml` (Postgres + Redis), root `.gitignore`, `.env.example` files.
- **Done when:** `/health` returns OK and the frontend can call it.

### Phase 2 — Persistence
- Add Prisma, write the full schema (Section 6), run first migration, add Prisma client singleton, seed script (optional).
- **Done when:** tables exist; a record survives a server restart.

### Phase 3 — Authentication
- Register/login/me; bcrypt; JWT; auth middleware; Zod schemas; login rate-limit.
- Frontend: login/register pages, token storage, protected routes, logout, 401 handling.
- **Done when:** private routes reject unauthenticated users; user A cannot access user B’s data (add a test).

### Phase 4 — First Monitor, First Check (no queue yet)
- Monitor CRUD with ownership checks and URL validation (incl. SSRF guard).
- A `checkService.runCheck(monitor)` that probes with timeout, classifies the result and stores a `CheckResult`.
- Temporary manual trigger (e.g. internal route or script).
- **Done when:** a monitor can be created and a manual check stores a correct row for 200, 500, timeout and unreachable hosts.

### Phase 5 — Queue and Worker
- BullMQ connections; `check-queue`; repeatable job per monitor (`monitor:<id>`).
- `monitor.worker.ts` calls `checkService.runCheck`. Worker runs as its own process (`npm run worker`).
- Create/update/pause/resume/delete keep the scheduler in sync. On API start, **reconcile** DB monitors with queue jobs.
- Configure concurrency, bounded retries (job failures only), graceful shutdown, job-retention trimming.
- **Done when:** checks run automatically at the interval, survive a worker restart, and pause/resume/delete behave correctly.

### Phase 6 — Incident Engine
- Implement the state machine (Section 5.2) inside the worker’s transaction.
- Open/resolve incidents; update `currentStatus` and counters; enqueue notification jobs on transitions.
- **Done when:** a simulated outage produces exactly one incident and a duplicate job produces no duplicate rows.

### Phase 7 — Dashboard and Analytics
- Uptime/latency endpoints (avg, p95, 24h/7d/30d); incident list.
- Frontend: monitor list with status badges, monitor detail with uptime cards, response-time chart, check table, incident history. Loading, error and empty states everywhere. Use TanStack Query; polling (e.g. 15–30 s) for now.
- **Done when:** the dashboard shows real data end-to-end.

### Phase 8 — Notifications
- `notification-queue` + `notification.worker.ts`; Nodemailer; HTML/text templates (monitor name, URL, failure reason, start time, duration on recovery).
- Preferences endpoints + settings page; record every attempt in `Notification`; bounded retries; unique `(incidentId, type)`.
- **Done when:** down and recovery e-mails arrive once each, and a broken SMTP server does not slow down checks.

### Phase 9 — Hardening
- Final SSRF review, rate limits, monitor quotas, input limits, log hygiene.
- Tests: unit (classification, state machine, uptime maths), API (auth/ownership), worker (timeouts, errors), idempotency, e2e (register → monitor → incident → recovery).
- Dockerfiles + full `docker-compose`; README with run instructions; health endpoints for API and workers.
- **Done when:** failure-path tests pass and the whole stack starts with one command.

### Phase 10 — Advanced (only after 1–9 are stable)
Socket.IO live updates, Prometheus metrics (queue depth, oldest job age, probe duration, checks/minute), Grafana dashboard, retention/roll-up jobs, then optional extras (TCP/DNS/TLS-expiry/keyword checks, Slack/Teams, maintenance windows).

---

## 10. Environment Variables

**`backend/.env.example`**
```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://uptimehub:password@localhost:5432/uptimehub
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=alerts@uptimehub.local
CHECK_WORKER_CONCURRENCY=10
MIN_INTERVAL_SECONDS=30
MAX_MONITORS_PER_USER=50
```

**`frontend/.env.example`**
```
VITE_API_URL=http://localhost:4000/api/v1
```

Validate backend env with Zod at startup. Never commit real `.env` files.

---

## 11. Commands (each run inside its own folder)

```bash
# root
docker compose up -d                 # postgres + redis

# backend/
npm install
npx prisma migrate dev
npm run dev                          # API  (tsx watch src/server.ts)
npm run worker                       # monitor + notification workers (separate process)
npm test

# frontend/
npm install
npm run dev                          # Vite on :5173
npm test
```

Add scripts to the relevant `package.json` if missing (`dev`, `build`, `start`, `worker`, `test`, `lint`, `typecheck`).

---

## 12. Coding Standards

- TypeScript **strict** mode on both sides; no `any` without a comment explaining why.
- Backend layering: `route → controller → service → (repository/Prisma)`. No Prisma calls in routes/controllers.
- Small functions, explicit return types on exported functions, descriptive names.
- One responsibility per file; keep files under ~300 lines.
- Frontend: server data via TanStack Query only (no copying into global state); every page handles loading / error / empty; no business logic inside JSX — put it in hooks/utils.
- No hard-coded URLs, secrets or magic numbers — use config.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), one logical change per commit.

---

## 13. Definition of Done (for every task)

- [ ] Code is in the correct folder (`frontend/` or `backend/`) and layer.
- [ ] Types compile (`typecheck`) and lint passes.
- [ ] Input validated; ownership enforced; errors handled.
- [ ] Tests added/updated for the behaviour, including at least one failure path.
- [ ] No secrets, tokens or response bodies in logs.
- [ ] API contract table (Section 8) and `.env.example` updated if changed.
- [ ] The phase’s **Done when** condition is demonstrably met.

---

## 14. Things You Must NOT Do

- Do not run checks inside Express request handlers or with `setInterval` in the API process.
- Do not retry endpoint failures at queue level.
- Do not store history in Redis.
- Do not skip the SSRF guard “for local testing”.
- Do not put application code in the repo root or create a third top-level app folder.
- Do not share source files between `frontend/` and `backend/`.
- Do not add features outside the current phase.
- Do not commit `.env`, `node_modules`, build output or credentials.