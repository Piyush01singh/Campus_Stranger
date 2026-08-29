# CampusStranger 🛡️

CampusStranger is an anonymous, end-to-end encrypted stranger chat platform designed to connect verified students seamlessly with zero plaintext backend exposure.

> **Current Status**: **Milestone 1 — Foundation + Monorepo + Local Infrastructure**  
> All core monorepo packages, local container infrastructure, shared contracts, crypto boundaries, and service skeletons are established and verified.

---

## 📁 Repository Structure

```text
campus-stranger/
├── apps/
│   ├── web/               # Next.js App Router (React, TypeScript, Tailwind CSS)
│   └── api/               # NestJS API (TypeScript, Health Check, Config, Filters)
├── packages/
│   ├── shared-types/      # Branded IDs, User/Conversation models, WebSocket & API contracts
│   └── crypto/            # Client-side cryptographic interfaces & boundary definitions
├── docker-compose.yml     # Local PostgreSQL 16 & Redis 7 infrastructure
├── turbo.json             # Turborepo task pipeline
├── pnpm-workspace.yaml    # pnpm workspace configuration
└── SPEC.md                # Master specification & technical blueprint
```

---

## 🛠️ Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **pnpm**: `v10.x` or `v11.x` (Enabled via `corepack enable`)
- **Docker & Docker Compose**: For local PostgreSQL and Redis

---

## 🚀 Getting Started

### 1. Installation

Install all monorepo dependencies across workspaces:

```bash
pnpm install
```

### 2. Environment Configuration

Copy the sample environment file to `.env`:

```bash
cp .env.example .env
```

### 3. Local Infrastructure (PostgreSQL & Redis)

Start the local database and cache services using Docker Compose:

```bash
# Start containers in background
docker compose up -d

# Verify health status
docker compose ps

# View logs
docker compose logs -f

# Stop containers
docker compose down
```

---

## 💻 Development & Execution

### Running All Services (Turborepo)

```bash
pnpm dev
```

- **Web App**: [http://localhost:3000](http://localhost:3000)
- **API Service**: [http://localhost:3001/api](http://localhost:3001/api)
- **API Health Check**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

### Running Individual Services

```bash
# Web application only
pnpm --filter @campus-stranger/web dev

# API application only
pnpm --filter @campus-stranger/api dev
```

---

## 🧪 Quality & Verification Scripts

```bash
# Type check all packages and applications
pnpm typecheck

# Run test suites across all workspaces
pnpm test

# Run ESLint across all workspaces
pnpm lint

# Format code with Prettier
pnpm format

# Verify formatting without modifying files
pnpm format:check

# Build all packages and applications for production
pnpm build
```

---

## 🔐 Security & Architectural Foundations

- **Zero-Knowledge Server Boundary**: Normal chat payloads are strictly encrypted on client devices. The backend relays and stores only ciphertext envelopes (`IEncryptedPayload`).
- **Nominal Branded Typing**: Prevents accidental runtime identifier misuse (e.g. `UserId`, `ConversationId`, `MessageId`).
- **Modular Monolith**: Designed for horizontal scaling without premature microservice complexity.




## how to run the website 

From the project root, run:

To stop it:

Press Ctrl+C in the terminal where it is running.
If you want to stop the local database/cache too:

Quick summary
Start app: pnpm dev
Stop app: Ctrl+C
Stop infra: docker compose down