# Production deployment

Set your analytics hostname in Caddyfile before deployment.
Runtime directory used in these examples: /opt/litestats.

Caddy terminates HTTPS and renews certificates automatically. The application listens only on 127.0.0.1:3100. PostgreSQL and ClickHouse are private Docker services with persistent named volumes. Docker and Caddy start on boot; containers restart automatically. Production has SEED_DEMO=false.

## Build and release

From app/, run `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, and `bun run build`. The build produces `.output/start.mjs`, which loads the reflect metadata polyfill before the production server. Use this entrypoint rather than server/index.mjs directly.

Copy `.output/` contents into `/opt/litestats/release/`. Keep a copy of the previous release before replacing it. Copy compose.yml to `/opt/litestats/compose.yml`. Preserve the existing private `.env` file; never overwrite database credentials or SESSION_KEY during an upgrade. Recreate the application with `docker compose up -d --force-recreate app` from `/opt/litestats`.

## Operations

Run these on the server from `/opt/litestats`:

- Status: `docker compose ps`
- Application logs: `docker compose logs --tail=100 app`
- Restart application: `docker compose restart app`
- Proxy logs: `journalctl -u caddy --since '10 minutes ago'`

Database backups must include both PostgreSQL and ClickHouse, plus `.env` (especially SESSION_KEY, which encrypts integration credentials). Store backups securely off-server. Do not run `docker compose down -v`: that removes persistent database volumes. Automated off-server backups have not been configured.

For future TLS configuration changes, validate `/etc/caddy/Caddyfile` with `caddy validate --config /etc/caddy/Caddyfile` and reload Caddy. Keep the domain pointing to this server.
