# Multi-stage production build for Manohar Companion (Unified Frontend + Backend + SQLite)
FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV DB_PATH=/data/manohar.sqlite

RUN npm install -g pnpm@10.25.0

# Copy workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy compiled bundles from builder
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# Persistent volume directory for SQLite database
RUN mkdir -p /data
VOLUME /data

EXPOSE 80

CMD ["node", "apps/server/dist/index.js"]
