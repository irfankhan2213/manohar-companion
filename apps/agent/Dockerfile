FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@10.25.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/agent/ apps/agent/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @saas/shared build && pnpm --filter @saas/agent build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY apps/agent apps/agent

RUN npm install -g pnpm@10.25.0 && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/agent/dist apps/agent/dist

CMD ["node", "apps/agent/dist/index.js", "start"]
