FROM node:26-bookworm-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /build
COPY app/package.json app/bun.lock ./
RUN bun install --frozen-lockfile
COPY app/ ./
RUN bun run build

FROM node:26-bookworm-slim AS app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 SEED_DEMO=false
WORKDIR /app
COPY --from=build --chown=node:node /build/.output/ ./
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=8s --start-period=60s --retries=5 CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "start.mjs"]
