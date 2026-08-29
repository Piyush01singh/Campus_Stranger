# ==============================================================================
# CampusStranger API - Production Multi-Stage Dockerfile (App Level)
# ==============================================================================

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/crypto/package.json ./packages/crypto/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/shared-types/tsconfig.json ./packages/shared-types/tsconfig.json
COPY packages/crypto/src ./packages/crypto/src
COPY packages/crypto/tsconfig.json ./packages/crypto/tsconfig.json
COPY apps/api/src ./apps/api/src
COPY apps/api/nest-cli.json apps/api/tsconfig.json ./apps/api/

RUN pnpm --filter @campus-stranger/shared-types build
RUN pnpm --filter @campus-stranger/crypto build
RUN pnpm --filter @campus-stranger/api build

RUN pnpm --filter @campus-stranger/api --prod --legacy deploy /app/deployed

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV API_HOST=0.0.0.0

RUN apk add --no-cache curl

USER node

COPY --chown=node:node --from=builder /app/deployed /app

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health/live || exit 1

CMD ["node", "dist/main.js"]
