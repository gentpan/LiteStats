# Install, backup and recovery

Run these commands from a trusted LiteStats checkout on a single Linux host.
The application keeps PostgreSQL for accounts/configuration and ClickHouse for events.
The default deployment runs one application process. Do not scale application replicas
while using the coordinated cloud restore feature.

## One-command installation

Requirements: Docker Engine, Docker Compose v2 or newer, Python 3.9+, OpenSSL.
The production build includes Bun in its build stage; Bun is not needed on the host.

```sh
python3 deploy/litestats.py install --directory /opt/litestats-instance --port 3100
```

The private directory must be outside the checkout. Installation generates independent
database passwords, a session/encryption key and `backup.key`; it never prints them.
It builds the application, starts both databases and waits for database/application
health. Only the application loopback port is published. Put your existing HTTPS
proxy in front of it, then open the site to create the first administrator.

Run the same command from an updated checkout to upgrade. Existing credentials and
volumes are retained. Before upgrading a healthy managed application it creates an
encrypted recovery backup. A failed application start restores the previous image
setting. It does not undo a PostgreSQL or ClickHouse image upgrade: test database
major-version upgrades separately. Default images target PostgreSQL 16 and ClickHouse
26.8 LTS. Never run `down -v` on an instance whose data you need.

The operations image only receives the operations script in its build context.
The application image uses an allowlisted source build context; local environment
files, keys, backups, logs, node_modules and build output are excluded.

## Unified encrypted backup

```sh
python3 /opt/litestats-instance/litestats.py backup \
  --config /opt/litestats-instance/.env \
  --compose-file /opt/litestats-instance/compose.yml
```

The command briefly stops the application, lets its accepted event buffer flush,
exports both databases while application writes/workers are stopped, restarts the
application and checks health. Files go to `backups/<UTC timestamp>.lsb` by default.
Use `--archive /opt/litestats-instance/backups/my-backup.lsb` for an explicit path.
No existing archive is replaced. Database services keep running; other applications
and their data are not touched. Requests received during the pause may fail; a backup
does not guarantee uninterrupted event collection.

One package contains a PostgreSQL custom-format dump (schema, data and sequences),
all supported ClickHouse application tables (schemas, Native data and row counts),
the private runtime configuration and a versioned SHA-256 manifest. MergeTree and
Log-family tables are supported; other engines fail explicitly. It is encrypted
with AES-256-CBC/PBKDF2 and authenticated with a separate PBKDF2-derived HMAC-SHA256
key. Authentication is checked before decryption/extraction. The process streams
large data files instead of loading a complete event history into memory.

Copy backups away from the server. Keep `backup.key` separately in a password manager
or another protected location; it is intentionally absent from the archive. Losing
it makes these encrypted backups unrecoverable. Keep the application release used
for the backup as well. Do not put either backups or keys into Git.

## Verify and recover

```sh
python3 /opt/litestats-instance/litestats.py verify \
  --config /opt/litestats-instance/.env \
  --archive /opt/litestats-instance/backups/my-backup.lsb

python3 /opt/litestats-instance/litestats.py restore \
  --config /opt/litestats-instance/.env \
  --compose-file /opt/litestats-instance/compose.yml \
  --archive /opt/litestats-instance/backups/my-backup.lsb
```

Use `--key-file /path/to/backup.key` for the original key. With Compose, the archive
and key must be inside the private instance directory so the operations container
can access them. Source archives must be from a trusted instance: PostgreSQL dump
schemas can execute SQL supplied by their creator.

Recovery verifies archive authentication, file checksums and structure before stopping
the application. It creates uniquely named databases, restores both, and checks every
backed-up table's row count. Only then does it atomically update the application's
connection configuration and original SESSION_KEY. Target database credentials,
listener, proxy and image configuration are retained. Supported application integration
settings are restored; review hostname-dependent callback URLs after moving servers.

A failed stage leaves the current configuration/databases unchanged. A failed application
health check after switching restores the previous configuration and restarts the previous
connection targets. The old databases are retained, together with a private
`.env.before-restore` and a restore receipt. Failed candidate databases also remain for
inspection; delete them only after confirming they are unneeded. This is a coordinated
single-host operation, not a distributed transaction across two database servers.

Use the corresponding or newer application/database versions when recovering. Do not
assume a backup from a newer major database release can restore into an older one.
Before reopening production traffic, verify administrator login, site list and reporting.

## Existing native systemd deployment

Existing native installations do not need to move their databases into Docker.
Install this script on the host, alongside PostgreSQL client tools, Python and OpenSSL.
Use the same backup/recovery engine with the private native environment file:

```sh
python3 /opt/litestats/ops/litestats.py backup \
  --config /etc/litestats/app.env --service litestats.service \
  --health-url http://127.0.0.1:13100/api/health \
  --archive /var/backups/litestats/manual-backup.lsb \
  --key-file /etc/litestats/backup.key
```

Replace `backup` with `verify` or `restore` and select the archive to recover. Native
recovery needs a role with CREATEDB and ClickHouse CREATE DATABASE privileges. If the
application's PostgreSQL role is restricted, set `PGADMIN_URL` in the operator's process
environment or private configuration; it creates the new database owned by the application
role. Do not grant broad administrator privileges to the web application just for recovery.
Use `CLICKHOUSE_ADMIN_URL` similarly if the application role cannot create databases; the tool grants the application access only to the new recovery database. A PostgreSQL client version compatible with the database server is required.

The database operations script itself serializes operations with an owner-only lock file.
Keep backup storage, configuration and key files protected. Run native operations as an
operator who can control the named service. No unrelated service is stopped.

## Existing R2/S3 panel

The administrator panel remains available for manual/scheduled cloud data backups of
PostgreSQL rows and the current event table. New format-2 cloud backups include signed
manifests, compressed-file checksums and a fingerprint of the instance encryption key.
Event chunks upload incrementally. Only completed backups are listed, including across
paginated storage results. Old format-1 data backups remain readable with their original
limitations (no checksum/signature).

Cloud backup/recovery enters maintenance: new requests return 503 with Retry-After,
existing requests and site-check jobs drain, then buffered events flush. Cloud recovery
stages and validates all event parts, makes a protective backup of current data, then
restores PostgreSQL in a transaction and switches the event table. It uses ordinary owner
permissions, retains the prior event table, and does not use superuser-only trigger bypass.
An interrupted cross-database switch may need operator recovery using the protective backup.

Cloud data backups require the original SESSION_KEY and a compatible initialized schema;
they do not include the host runtime file or application binaries. For full server migration
or disaster recovery, use the unified encrypted package above. Nothing in installation or
upgrade enables an external storage destination or automatic schedule on your behalf.
