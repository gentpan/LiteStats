# syntax=docker/dockerfile:1

FROM oven/bun:1.3-alpine AS base
WORKDIR /app

FROM base AS builder
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/web/prisma ./apps/web/prisma
COPY packages/tracker/package.json ./packages/tracker/
RUN bun install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build:tracker
RUN ln -sf /app/node_modules /app/apps/web/node_modules
WORKDIR /app/apps/web
RUN bun --bun run build
WORKDIR /app

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S litestats && adduser -S litestats -G litestats

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/packages/tracker/package.json ./packages/tracker/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/prisma ./apps/web/prisma
COPY --from=builder /app/apps/web/src ./apps/web/src
COPY --from=builder /app/apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY deploy/docker-entrypoint.sh /entrypoint.sh
COPY deploy/docker-worker-entrypoint.sh /worker-entrypoint.sh

RUN chmod +x /entrypoint.sh /worker-entrypoint.sh && chown -R litestats:litestats /app
USER litestats

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
