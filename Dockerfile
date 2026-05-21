# syntax=docker/dockerfile:1

# ─── Stage 1: install all workspace deps ─────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only package manifests first to maximise layer cache reuse
COPY package.json package-lock.json .npmrc* ./
COPY packages/core/package.json       packages/core/package.json
COPY packages/server/package.json     packages/server/package.json
COPY packages/ui/package.json         packages/ui/package.json
COPY packages/evaluator/package.json  packages/evaluator/package.json
COPY apps/cli/package.json            apps/cli/package.json
COPY apps/desktop/package.json        apps/desktop/package.json
COPY apps/local-web/package.json      apps/local-web/package.json
COPY apps/platform-web/package.json   apps/platform-web/package.json

RUN npm ci

# ─── Stage 2: build platform artefacts ───────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .

RUN npm run build --workspace @suit-skills/core \
 && npm run build --workspace @suit-skills/server \
 && npm run build --workspace @suit-skills/app-platform-web

# ─── Stage 3: production API image ───────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production \
    PLATFORM_API_HOST=0.0.0.0 \
    PLATFORM_API_PORT=4591

RUN apk add --no-cache git openssh-client

# Production-only workspace install (no devDeps)
COPY package.json package-lock.json .npmrc* ./
COPY packages/core/package.json       packages/core/package.json
COPY packages/server/package.json     packages/server/package.json
COPY packages/ui/package.json         packages/ui/package.json
COPY packages/evaluator/package.json  packages/evaluator/package.json
COPY apps/cli/package.json            apps/cli/package.json
COPY apps/desktop/package.json        apps/desktop/package.json
COPY apps/local-web/package.json      apps/local-web/package.json
COPY apps/platform-web/package.json   apps/platform-web/package.json

RUN npm ci --omit=dev --workspaces --include-workspace-root

# Copy only the built server output
COPY --from=build /app/packages/core/dist   packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist

EXPOSE 4591
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PLATFORM_API_PORT}/api/health" >/dev/null || exit 1

CMD ["npm", "run", "start:platform-api"]

# ─── Stage 4: production nginx/web image ─────────────────────────────────────
FROM nginx:1.27-alpine AS web

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/platform-web /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
