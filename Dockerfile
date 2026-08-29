# ==============================================================================
# CampusStranger API - Production Multi-Stage Dockerfile
# ==============================================================================

# Stage 1: Base image with pnpm package manager (Node 22 LTS)
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

# Stage 2: Build dependencies & compile TypeScript
FROM base AS builder
WORKDIR /app

# Copy workspace configuration and all package manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/crypto/package.json ./packages/crypto/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source code without overriding node_modules
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/shared-types/tsconfig.json ./packages/shared-types/tsconfig.json
COPY packages/crypto/src ./packages/crypto/src
COPY packages/crypto/tsconfig.json ./packages/crypto/tsconfig.json
COPY apps/api/src ./apps/api/src
COPY apps/api/nest-cli.json apps/api/tsconfig.json ./apps/api/

# Build libraries and API service
RUN pnpm --filter @campus-stranger/shared-types build
RUN pnpm --filter @campus-stranger/crypto build
RUN pnpm --filter @campus-stranger/api build

# Isolate production dependencies and built distribution
RUN pnpm --filter @campus-stranger/api --prod --legacy deploy /app/deployed

# Stage 3: Minimal production runtime image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV API_HOST=0.0.0.0

# Install curl for container health monitoring
RUN apk add --no-cache curl

# Run as non-root standard node user
USER node

# Copy isolated production application
COPY --chown=node:node --from=builder /app/deployed /app

EXPOSE 8080

# Container liveness health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health/live || exit 1

# Start NestJS API service
CMD ["node", "dist/main.js"]
