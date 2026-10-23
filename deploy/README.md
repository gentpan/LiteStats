# Production deployment

The current production layout uses native systemd services and the existing FrankenPHP/Caddy proxy. Docker Compose remains an alternative below. Set your own analytics hostname; keep database services private and preserve existing applications and proxy sites.

## Managed installation and unified recovery

Use the [installation and recovery guide](OPERATIONS.md) for the managed Docker Compose installer, encrypted PostgreSQL + ClickHouse + runtime backup packages, verification, staged recovery and native-systemd commands.

```sh
python3 deploy/litestats.py install --directory /opt/litestats-instance --port 3100
```

The existing native deployment below remains supported. It is not converted to Docker during application upgrades. The unified backup script can run directly on that host with its existing private environment file and service.

## Build

From `app/`, run:

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run check:unused
bun run build
```

Publish the complete `.output/` directory contents. Its `start.mjs` loads the reflect metadata polyfill before the production server; use this entrypoint rather than `server/index.mjs` directly. Bun is needed for building; the release runs with Node.js 22 or newer. The native deployment currently uses Node.js 26.

## Native services and configuration

| Component | Layout |
| --- | --- |
| Application | `litestats.service`; `/opt/litestats/current` points to `releases/<release-id>` |
| Application configuration | Private `/etc/litestats/app.env`, loaded with systemd `EnvironmentFile` |
| Application listener | `HOST=127.0.0.1`, `PORT=13100`; port 3100 belongs to another application |
| PostgreSQL | Existing native PostgreSQL, with a separate `litestats` database and role |
| ClickHouse | `litestats-clickhouse.service`; private listeners `127.0.0.1:8123` and `127.0.0.1:9000` |
| ClickHouse configuration | Private `/etc/litestats/clickhouse.xml`; separate private data and log directories |
| HTTPS proxy | Existing FrankenPHP/Caddy service; a separate virtual host under `/etc/frankenphp/sites/*.caddy` |

Run the application as its dedicated unprivileged service account. Set `NODE_ENV=production`, `SEED_DEMO=false`, independent database credentials, and a random `SESSION_KEY` of at least 32 characters. Keep the environment file owner-only (`0600`) and never replace it with the development template during an upgrade. The production app does not create a demo account. A new empty instance opens `/setup` to create its only administrator, whose authority is persisted without an email allowlist. Once initialized, setup and public registration are closed. Existing verified administrators listed in `ADMIN_EMAILS` remain supported for compatibility.

ClickHouse uses the verified 26.8 LTS static package at `/opt/litestats-clickhouse/clickhouse-common-static-26.8.34.13/usr/bin/clickhouse`. Its configuration uses UTC, a 1 GB server memory cap, a 1.4 GB systemd memory limit, and two independently generated password hashes. Keep both HTTP and native ports on loopback; do not copy passwords or hashes into this repository. Preserve its configuration, data, and log ownership when upgrading the binary.

Add only the analytics virtual host to the existing FrankenPHP configuration and proxy to `127.0.0.1:13100`. Validate the existing main configuration with the installed FrankenPHP binary before reloading its existing service. Preserve unrelated virtual hosts, certificates, and listeners; installing a second proxy on ports 80/443 is unnecessary.

### Release and rollback

Before upgrading, back up both databases and the private runtime configuration. Copy the new `.output/` contents into a new `/opt/litestats/releases/<release-id>/` directory, with permissions allowing the service account to read the complete release. Check that `start.mjs`, `reflect.cjs`, `server/`, and `public/` are present. Do not overwrite the directory currently in use.

After setting `release_id` to the prepared directory name, switch the symlink atomically and restart only the application:

```sh
ln -s "releases/$release_id" /opt/litestats/current.next
mv -Tf /opt/litestats/current.next /opt/litestats/current
systemctl restart litestats.service
```

Keep the previous release and record the previous symlink target. To roll back, repeat the same symlink switch with that release ID and restart the app. Application rollback does not undo database schema changes; assess compatibility before restoring a database. Retain the original Umami installation and its backups until migration validation and the agreed retention period are complete. The three migrated sites already use the new tracker; future releases do not require replacing their tags again.

### Status and health checks

```sh
systemctl is-active litestats.service litestats-clickhouse.service
systemctl status litestats.service litestats-clickhouse.service --no-pager
curl --max-time 10 -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:13100/
curl --max-time 10 -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:13100/login
curl --max-time 10 -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8123/ping
```

An empty instance returns `307` from the root to `/setup`. After initialization, the root returns `307` to `/login` or `/dashboard`, depending on the session; `/login` and ClickHouse `/ping` should return `200`. Also check the public HTTPS URL. Successful HTTP responses establish reachability, not event persistence: verify a controlled page visit in the dashboard when validating collection. Inspect service logs locally as needed, and redact credentials or tokens before sharing them.

### Backups and credentials

A recoverable native backup must include a PostgreSQL `pg_dump`, ClickHouse schema and event data, and the private runtime configuration, especially `SESSION_KEY`. This key signs sessions and encrypts integration credentials. Include the ClickHouse configuration and retain the corresponding release ID. Protect local backup files and offline copies with owner-only permissions (`0600`) and keep a protected copy away from the server.

Read database credentials from protected runtime files. For PostgreSQL command-line tools, use an owner-only password file with `PGPASSFILE`; never put passwords or session keys in command arguments, shell history, documentation, or pasted logs. Do not print environment files or secrets while checking a backup. Verify restore procedures against isolated databases before replacing production data. No automated off-server backup schedule is implied by this deployment.

### Geographic data

Historical imported geography remains available. `GEOIP_PROVIDER=cnip` opts into server-side lookup of public client IPs at api.cnip.io for domestic and international visits. Production enables this option; templates default to disabled. Lookups have bounded timeouts, concurrency and in-memory caching; raw IPs are not stored with events. Only trusted proxy headers are accepted. No MaxMind database is installed.

Chinese reports display region and city labels in Simplified Chinese. The server resolves city names/GeoNames IDs using the bundled public GeoNames translation dictionary, scoped to country and subdivision. Unresolvable or ambiguous cities show “暂无中文名称”; original keys remain searchable and filterable. Historical events and newly collected events share this display path, without rewriting event data, identities or counts. See `app/src/assets/city-names-SOURCE.md` for attribution and reproduction.

## Docker Compose installation

The managed installer builds `deploy/Dockerfile`, copies the runtime Compose/operations files into the private instance directory, generates credentials only for new instances, and waits for health. PostgreSQL and ClickHouse keep persistent named volumes without host-published ports. See [OPERATIONS.md](OPERATIONS.md) for install, upgrade, backup, verify and recovery commands.

The root `docker-compose.yml` remains for local development only. It is not the managed production installer. Never run it against production volume directories.
