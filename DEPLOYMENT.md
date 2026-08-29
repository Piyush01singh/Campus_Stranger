# Production Deployment Guide: CampusStranger

This guide details the deployment architecture, configuration, containerization, environment variables, health checks, WebSocket requirements, and operational procedures for **CampusStranger**.

The target hosting architecture is **LOCKED**:
* **Frontend**: Vercel (Next.js 14)
* **Backend**: Render Web Service (NestJS API + Socket.IO Docker container)
* **Database**: Neon (Serverless PostgreSQL with SSL)
* **Redis**: Upstash (Managed Redis with TLS)

---

## 1. Architecture Topology

```text
┌────────────────────────────────────────────────────────┐
│             Frontend (Next.js 14 / Edge)               │
│                  Target: Vercel                        │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / WSS
                           ▼
┌────────────────────────────────────────────────────────┐
│             API & WebSocket Gateway (NestJS)           │
│             Target: Render Web Service (Docker)        │
└───────────────────┬────────────────────┬───────────────┘
                    │                    │
                    ▼                    ▼
     ┌────────────────────────┐   ┌───────────────────────┐
     │ PostgreSQL (Durable)   │   │ Redis (Transient)     │
     │ Target: Neon Serverless│   │ Target: Upstash TLS   │
     └────────────────────────┘   └───────────────────────┘
```

| Component | Target Platform | Primary Responsibilities |
|---|---|---|
| **Frontend** | **Vercel** | Next.js 14 App Router, WebCrypto E2EE client, UI rendering, static assets |
| **API & Gateway** | **Render Web Service** | NestJS REST API, Socket.IO gateway, JWT authentication, authorization, metadata routing |
| **Database** | **Neon** | Serverless PostgreSQL with SSL, durable storage for ciphertext messages, users, and connections |
| **Transient Store** | **Upstash** | Managed Redis with TLS, distributed matchmaking queue, presence tracking, rate limiting, Socket.IO Pub/Sub adapter |

---

## 2. Service Configuration

### A. Backend: Render Web Service (Docker)

* **Service Type**: Web Service
* **Environment**: `Docker`
* **Dockerfile Path**: `./Dockerfile` (or `Dockerfile` at repository root)
* **Docker Context**: `.`
* **Health Check Path**: `/api/health/live`
* **Auto-Deploy**: Enabled on push to `main` branch

#### Required Environment Variables on Render:

| Variable | Required | Type | Example / Description |
|---|:---:|:---:|---|
| `NODE_ENV` | Yes | `string` | `production` |
| `PORT` | Yes | `number` | `10000` (Injected automatically by Render, or platform default) |
| `API_HOST` | Yes | `string` | `0.0.0.0` (Binds on all interfaces) |
| `DATABASE_URL` | Yes | `string` | `postgresql://user:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/campus_stranger?sslmode=require` |
| `REDIS_URL` | Yes | `string` | `rediss://default:password@us1-quick-tiger-12345.upstash.io:6379` |
| `SESSION_SECRET` | Yes | `string` | Strong 64+ character random string for signing JWT session tokens |
| `CORS_ORIGIN` | Yes | `string` | `https://campus-stranger.vercel.app` (or comma-separated allowed frontend origins) |
| `FRONTEND_URL` | Yes | `string` | `https://campus-stranger.vercel.app` (Used for OAuth callback redirects) |
| `GOOGLE_CLIENT_ID` | Optional / Pending | `string` | Google Cloud OAuth 2.0 Web Client ID |
| `GOOGLE_CLIENT_SECRET`| Optional / Pending | `string` | Google Cloud OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | Optional / Pending | `string` | `https://<render-service-subdomain>.onrender.com/api/auth/google/callback` |

---

### B. Frontend: Vercel

* **Framework Preset**: Next.js
* **Root Directory**: `./` (or `apps/web`)
* **Build Command**: `pnpm --filter @campus-stranger/web build`
* **Output Directory**: `apps/web/.next`

#### Required Environment Variables on Vercel:

| Variable | Required | Scope | Example / Description |
|---|:---:|:---:|---|
| `NEXT_PUBLIC_API_URL` | Yes | Public / Client | `https://<render-service-subdomain>.onrender.com` (Base URL for API & WebSocket) |
| `NEXT_PUBLIC_WS_URL` | Optional | Public / Client | `https://<render-service-subdomain>.onrender.com` (Dedicated WebSocket origin if separate) |

> [!CAUTION]
> **Client-Side Secret Isolation**: Variables prefixed with `NEXT_PUBLIC_` are exposed in browser bundles. Never prefix `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, or `GOOGLE_CLIENT_SECRET` with `NEXT_PUBLIC_`.

---

## 3. Build and Startup Commands

### API Service (`apps/api`)

* **Local Development**:
  ```bash
  pnpm --filter @campus-stranger/api dev
  ```
* **Production Build**:
  ```bash
  pnpm --filter @campus-stranger/api build
  ```
* **Production Runtime Command**:
  ```bash
  node dist/main.js
  ```
* **Docker Image Build**:
  ```bash
  docker build -t campus-stranger-api:latest .
  ```

### Frontend Service (`apps/web`)

* **Local Development**:
  ```bash
  pnpm --filter @campus-stranger/web dev
  ```
* **Production Build**:
  ```bash
  pnpm --filter @campus-stranger/web build
  ```
* **Production Start**:
  ```bash
  pnpm --filter @campus-stranger/web start
  ```

---

## 4. Health Check Endpoints

The API provides two distinct health endpoints for monitoring and orchestrator integration:

### A. Liveness Probe: `GET /api/health/live`
* **Configured in Render**: Set as the **Health Check Path** (`/api/health/live`) in Render Web Service settings.
* **Purpose**: Lightweight container liveness ping.
* **Overhead**: Microsecond in-memory response (does not query external database/Redis).
* **Sample Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "uptime": 3600
    },
    "timestamp": "2026-08-29T12:00:00.000Z"
  }
  ```

### B. Readiness Probe: `GET /api/health`
* **Purpose**: Full dependency readiness verification (Neon PostgreSQL + Upstash Redis ping).
* **Security**: Never exposes database credentials, hostnames, passwords, or internal stack traces.
* **Sample Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "timestamp": "2026-08-29T12:00:00.000Z",
      "uptime": 3600,
      "environment": "production",
      "version": "0.1.0",
      "services": {
        "database": "connected",
        "redis": "connected"
      }
    },
    "timestamp": "2026-08-29T12:00:00.000Z"
  }
  ```

---

## 5. WebSocket & Realtime Requirements

1. **Render WebSocket Support**:
   - Render Web Services natively support persistent WebSocket connections over TLS with automatic `HTTP/1.1` connection upgrade.
   - Sticky sessions are NOT required because Socket.IO utilizes `@socket.io/redis-adapter` for multi-instance cross-node pub/sub message synchronization.
2. **CORS & Origin Validation**:
   - Socket.IO gateway strictly enforces whitelist origins from `CORS_ORIGIN`. Wildcard origins (`*`) are disabled in production.
3. **Transport Protocol**:
   - Transports supported: `['websocket', 'polling']` with automatic WebSocket upgrade.
4. **Rate Limiting**:
   - Redis-backed sliding-window rate limiters protect WebSocket event emitters against abuse (`chat:send`, `match:join`, `sync`).

---

## 6. Containerization & Security Hardening

* **Multi-Stage Build**:
  - Compiles TypeScript via `@campus-stranger/shared-types`, `@campus-stranger/crypto`, and `@campus-stranger/api`.
  - Isolates production dependencies via `pnpm deploy --prod`.
* **Minimal Runtime Footprint**:
  - Built on `node:22-alpine` (Node.js 22 LTS).
  - Runtime content size: ~68 MB.
* **Least Privilege**:
  - Container executes under non-root system user `node` (UID 1000).
* **Signal Handling & Graceful Shutdown**:
  - NestJS shutdown hooks (`app.enableShutdownHooks()`) capture `SIGTERM` and `SIGINT`.
  - Drains active HTTP/WebSocket connections, closes PostgreSQL pool, and disconnects Redis clients before container exit.

---

## 7. Rollback & Disaster Recovery Procedures

1. **Render Web Service Rollback**:
   - In the Render Dashboard, navigate to the Web Service -> **Events / Deploys** -> select any previous successful deploy and click **Rollback to this deploy**.
   - Automated schema migrations are additive and backward-compatible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
2. **Frontend Rollback**:
   - In Vercel dashboard, click **Instant Rollback** to revert to a previous immutable deployment artifact.
3. **Database Safeguards**:
   - Neon provides Point-in-Time Recovery (PITR) and instant branching for zero-downtime rollbacks.
