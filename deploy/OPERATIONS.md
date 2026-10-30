# Plost installation, backup and recovery

Run these commands from a trusted Plost checkout on a single Linux host.
Existing service, database and backup identifiers are retained for compatibility.
The application keeps PostgreSQL for accounts/configuration and ClickHouse for events.
The default deployment runs one application process. Do not scale application replicas
while using the coordinated cloud restore feature.

## Administrator dashboard

Open **Settings → System settings → Backup** (`/account?tab=system/backup`).
The first panel, **Full backup and recovery**, needs no object storage configuration:

1. **Create full backup** saves both database schemas/data and runtime configuration in one authenticated, encrypted `.lsb` archive. Download it from the resulting list.
2. **Download recovery key** asks for the current administrator password. Save this file separately from the archive.
3. On the target instance, initialize its administrator, open the same panel, and **Upload backup**. Upload the original recovery key when the backup came from another instance.
4. **Verify and recover** first checks authentication, checksums and archive structure and shows site/account/event counts. Verification does not stop the application.
5. Enter the current target administrator password and type `RESTORE`. Recovery automatically makes a protective full backup, restores new databases, checks every table count, switches connections and checks application health. Sign in again using the account/password from the backup. Previous databases remain available.

The application briefly pauses for full backup/recovery. An independent host supervisor continues the job across application restarts; the browser reconnects using a status-only job ticket. The ticket cannot download archives or keys or initiate recovery. Reloading the same tab preserves its progress. Uploaded files are streamed (maximum 10 GiB), with an opaque server filename. Passwords and uploaded recovery keys are never saved in browser storage; uploaded keys are removed after the job or its preparation expires.

Only restore archives from instances you trust. Database dumps contain executable schema definitions. The optional **cloud data backup and recovery** section below retains the existing R2/S3 schedule and data backups; these are separate from full instance packages.

### Supervisor boundary

The managed Linux installer automatically creates a root systemd supervisor with a private Unix socket and a generated authentication token. Only its socket directory is mounted read-only into the application container. Neither the Docker socket, host configuration, recovery key nor backup directory is mounted into the web container. No public supervisor port is opened. HTTP requests cannot choose shell commands, service names or filesystem paths.

Managed installation requires root on a Linux systemd host. macOS development can still use the CLI; it does not install a host supervisor. Native installations use the same supervisor with a fixed application service/configuration and an operator-only environment file. PostgreSQL may use root-to-postgres peer authentication for database creation while the web role retains normal permissions. XML-managed ClickHouse users retain an exact database allowlist: the supervisor adds only each newly restored database, using a separate loopback-only identity restricted to the recovery database prefix and configuration reload. Do not place operator credentials in the web environment.

## One-command installation

Requirements: Linux with systemd, root, Docker Engine, Docker Compose v2 or newer, Python 3.9+, OpenSSL.
The production build includes Bun in its build stage; Bun is not needed on the host.

```sh
python3 deploy/plost.py install --directory /opt/plost-instance --port 3100
```

For an existing instance, keep its original directory and port when upgrading.
Do not create a new instance just to match the renamed example path. The previous
command entry point remains supported.

The private directory must be outside the checkout. Installation generates independent
database passwords, a session/encryption key and `backup.key`; it never prints them.
It builds the application, starts both databases and waits for database/application
health. Only the application loopback port is published. Put your existing HTTPS
proxy in front of it, then open the site to create the first administrator.

Run the same command from an updated checkout to upgrade. Existing credentials and
volumes are retained. Before upgrading a healthy managed application it creates at
most one encrypted recovery backup per UTC day; repeated upgrades on the same day
reuse that recovery point and do not stop the application for another backup.
Manual backups and the separate pre-restore safety backup are not skipped. A failed application start restores the previous image
setting. It does not undo a PostgreSQL or ClickHouse image upgrade: test database
major-version upgrades separately. Default images target PostgreSQL 16 and ClickHouse
26.8 LTS. Never run `down -v` on an instance whose data you need.

The operations image only receives the operations script in its build context.
The application image uses an allowlisted source build context; local environment
files, keys, backups, logs, node_modules and build output are excluded.

## Unified encrypted backup

```sh
python3 /opt/plost-instance/plost.py backup \
  --config /opt/plost-instance/.env \
  --compose-file /opt/plost-instance/compose.yml
```

The command briefly stops the application, lets its accepted event buffer flush,
exports both databases while application writes/workers are stopped, restarts the
application and checks health. Files go to `backups/<UTC timestamp>.lsb` by default.
Use `--archive /opt/plost-instance/backups/my-backup.lsb` for an explicit path.
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
python3 /opt/plost-instance/plost.py verify \
  --config /opt/plost-instance/.env \
  --archive /opt/plost-instance/backups/my-backup.lsb

python3 /opt/plost-instance/plost.py restore \
  --config /opt/plost-instance/.env \
  --compose-file /opt/plost-instance/compose.yml \
  --archive /opt/plost-instance/backups/my-backup.lsb
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
