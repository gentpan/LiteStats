#!/usr/bin/env python3
"""Single-host install, consistent encrypted backup, and staged two-database recovery.
Only Python's standard library is used. Secrets are never passed as command arguments.
"""
import argparse
import base64
import contextlib
import datetime
import fcntl
import gzip
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import xml.etree.ElementTree as ET
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit, urlunsplit
from urllib.request import urlopen

MAGIC = b"LITESTATS-BACKUP-2\n"
BLOCK = 1024 * 1024

class OpsError(Exception):
    pass

def run(args, *, env=None, output=None, input_data=None):
    result = subprocess.run(args, env=env, input=input_data, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE)
    if result.returncode:
        # Tool/database error output can include credentials or SQL data; do not echo it.
        raise OpsError(f"{Path(args[0]).name} failed (exit {result.returncode}); operation stopped")
    return result.stdout

def read_env(path):
    values = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        key, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key.strip()):
            raise OpsError("Unsupported environment file syntax")
        value = value.strip()
        if value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        values[key.strip()] = value
    return values

def private_write(path, content):
    path = Path(path)
    temporary = path.with_name(path.name + ".next-" + secrets.token_hex(4))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        if path.exists():
            owner=path.stat()
            os.fchown(fd,owner.st_uid,owner.st_gid)
        with os.fdopen(fd, "wb") as stream:
            stream.write(content.encode() if isinstance(content, str) else content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def patch_env(path, changes):
    lines = Path(path).read_text().splitlines()
    remaining = dict(changes)
    output = []
    for line in lines:
        match = re.match(r"(?:export )?([A-Z][A-Z0-9_]*)=", line.strip())
        if match and match[1] in changes:
            if match[1] in remaining:
                output.append(match[1] + "=" + json.dumps(remaining.pop(match[1])))
        else:
            output.append(line)
    output.extend(key + "=" + json.dumps(value) for key, value in remaining.items())
    private_write(path, "\n".join(output) + "\n")

def ident(value):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise OpsError("Unsupported database/table identifier")
    return '"' + value + '"'

def pg_env(url, database=None):
    u = urlsplit(url)
    if u.scheme not in ("postgres", "postgresql"):
        raise OpsError("Invalid PostgreSQL URL")
    env = dict(os.environ)
    # Do not let ambient libpq settings redirect a backup to a different database.
    for key in list(env):
        if key.startswith("PG"):
            env.pop(key)
    env.update(PGHOST=u.hostname or "127.0.0.1", PGPORT=str(u.port or 5432),
               PGUSER=unquote(u.username or "postgres"), PGPASSWORD=unquote(u.password or ""),
               PGDATABASE=database or unquote(u.path.lstrip("/")), PGCONNECT_TIMEOUT="10")
    for source, target in (("host", "PGHOST"), ("sslmode", "PGSSLMODE"), ("sslrootcert", "PGSSLROOTCERT")):
        if source in parse_qs(u.query):
            env[target] = parse_qs(u.query)[source][0]
    return env

def psql(url, sql, database=None):
    prefix=[]
    # Only the private host operator may opt into peer-authenticated database creation.
    if os.environ.get('PGADMIN_OS_USER') and url==os.environ.get('PGADMIN_URL'):
        user=os.environ['PGADMIN_OS_USER']
        if os.geteuid()!=0 or not re.fullmatch(r'[a-z_][a-z0-9_-]*',user):raise OpsError('Invalid operator OS identity')
        prefix=['runuser','-u',user,'--']
    return run(prefix+["psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", sql],
               env=pg_env(url, database)).decode().strip()

class ClickHouse:
    def __init__(self, url):
        self.url = urlsplit(url)
        self.database = unquote(self.url.path.lstrip("/")) or "default"
        ident(self.database)

    @contextlib.contextmanager
    def request(self, query, source=None):
        u = self.url
        if u.scheme not in ("http", "https") or u.query or u.fragment:
            raise OpsError("Unsupported ClickHouse URL")
        cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
        connection = cls(u.hostname, u.port, timeout=600)
        auth = base64.b64encode((unquote(u.username or "default") + ":" + unquote(u.password or "")).encode()).decode()
        headers = {"Authorization": "Basic " + auth}
        params = {"database": self.database, "wait_end_of_query": "1"}
        try:
            if source:
                params["query"] = query
                headers.update({"Content-Encoding": "gzip", "Content-Length": str(Path(source).stat().st_size)})
                with open(source, "rb") as body:
                    connection.request("POST", "/?" + urlencode(params), body, headers)
            else:
                connection.request("POST", "/?" + urlencode(params), query.encode(), headers)
            response = connection.getresponse()
            if response.status != 200:
                raise OpsError("ClickHouse operation failed; no credentials or response data logged")
            yield response
        finally:
            connection.close()

    def text(self, query):
        with self.request(query) as response:
            return response.read().decode().strip()

    def rows(self, query):
        return json.loads(self.text(query + " FORMAT JSON"))["data"]

    def table(self, name, database=None):
        return ident(database or self.database) + "." + ident(name)

def digest(path):
    value = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(BLOCK), b""):
            value.update(chunk)
    return value.hexdigest()

def backup_key(path, create=False):
    path = Path(path)
    if not path.exists() and create:
        private_write(path, secrets.token_urlsafe(48) + "\n")
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise OpsError("Backup key must exist and have owner-only permissions (0600)")
    key = path.read_text().strip()
    if len(key) < 32:
        raise OpsError("Backup key must be at least 32 characters")
    return key

def crypt_env(key):
    return {**os.environ, "LITESTATS_ARCHIVE_KEY": key}

def mac_file(path, key, salt, length=None):
    derived = hashlib.pbkdf2_hmac("sha256", key.encode(), salt, 200000, 32)
    value = hmac.new(derived, digestmod="sha256")
    with open(path, "rb") as stream:
        remaining = length if length is not None else Path(path).stat().st_size
        while remaining:
            chunk = stream.read(min(BLOCK, remaining))
            if not chunk:
                raise OpsError("Truncated backup archive")
            value.update(chunk)
            remaining -= len(chunk)
    return value.digest()

def seal(source, destination, key, work):
    encrypted = work / "ciphertext"
    run(["openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "200000",
         "-pass", "env:LITESTATS_ARCHIVE_KEY", "-in", str(source), "-out", str(encrypted)], env=crypt_env(key))
    salt = secrets.token_bytes(16)
    temporary = Path(str(destination) + ".partial")
    try:
        with open(temporary, "xb") as output:
            os.chmod(temporary, 0o600)
            output.write(MAGIC + salt)
            with open(encrypted, "rb") as body:
                shutil.copyfileobj(body, output, BLOCK)
        tag = mac_file(temporary, key, salt)
        with open(temporary, "ab") as output:
            output.write(tag)
            output.flush()
            os.fsync(output.fileno())
        if Path(destination).exists():
            raise OpsError("Refusing to replace an existing backup")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)

def unseal(source, work, key):
    source = Path(source)
    size = source.stat().st_size
    with open(source, "rb") as stream:
        if stream.read(len(MAGIC)) != MAGIC or size < len(MAGIC) + 16 + 32:
            raise OpsError("Unsupported or truncated backup archive")
        salt = stream.read(16)
        stream.seek(-32, 2)
        expected = stream.read(32)
    if not hmac.compare_digest(expected, mac_file(source, key, salt, size - 32)):
        raise OpsError("Backup authentication failed: wrong key or damaged archive")
    cipher = work / "ciphertext"
    with open(source, "rb") as stream, open(cipher, "wb") as output:
        stream.seek(len(MAGIC) + 16)
        remaining = size - len(MAGIC) - 16 - 32
        while remaining:
            chunk = stream.read(min(BLOCK, remaining))
            output.write(chunk)
            remaining -= len(chunk)
    archive = work / "payload.tar"
    run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
         "-pass", "env:LITESTATS_ARCHIVE_KEY", "-in", str(cipher), "-out", str(archive)], env=crypt_env(key))
    folder = work / "payload"
    folder.mkdir(mode=0o700)
    with tarfile.open(archive) as tar:
        seen = set()
        for member in tar:
            if not member.isfile() or not re.fullmatch(r"[a-zA-Z0-9_.-]+", member.name) or member.name in seen:
                raise OpsError("Invalid archive entry")
            seen.add(member.name)
            with tar.extractfile(member) as data, open(folder / member.name, "xb") as output:
                shutil.copyfileobj(data, output, BLOCK)
    manifest = json.loads((folder / "manifest.json").read_text())
    if manifest.get("app") != "litestats" or manifest.get("version") != 2:
        raise OpsError("Unsupported backup manifest")
    files = manifest.get("files", {})
    if set(files) != seen - {"manifest.json"} or not {"postgres.dump", "runtime.env"} <= set(files):
        raise OpsError("Incomplete backup archive")
    for name, checksum in files.items():
        if digest(folder / name) != checksum:
            raise OpsError("Backup checksum verification failed")
    return folder, manifest

def pg_counts(url):
    tables = json.loads(psql(url, "SELECT COALESCE(json_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public'"))
    return {name: int(psql(url, "SELECT count(*) FROM public." + ident(name))) for name in tables}

def export_backup(config_path, destination, key_path):
    config = read_env(config_path)
    key = backup_key(key_path, create=True)
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.exists():
        raise OpsError("Backup path already exists")
    ch = ClickHouse(config["CLICKHOUSE_URL"])
    with tempfile.TemporaryDirectory(prefix="litestats-backup-") as temporary:
        work = Path(temporary)
        payload = work / "payload"
        payload.mkdir(mode=0o700)
        with open(payload / "postgres.dump", "wb") as output:
            run(["pg_dump", "--format=custom", "--no-owner", "--no-acl"], env=pg_env(config["DATABASE_URL"]), output=output)
        shutil.copyfile(config_path, payload / "runtime.env")
        tables = ch.rows("SELECT name,engine FROM system.tables WHERE database=currentDatabase() ORDER BY name")
        metadata = []
        for table in tables:
            name = table["name"]
            ident(name)
            if "MergeTree" not in table["engine"] and table["engine"] not in ("Log", "TinyLog", "StripeLog"):
                raise OpsError("Unsupported ClickHouse table engine; backup stopped")
            (payload / (name + ".schema")).write_text(ch.text("SHOW CREATE TABLE " + ch.table(name) + " FORMAT TabSeparatedRaw"))
            with ch.request("SELECT * FROM " + ch.table(name) + " FORMAT Native") as response:
                with gzip.open(payload / (name + ".native.gz"), "wb") as output:
                    shutil.copyfileobj(response, output, BLOCK)
            metadata.append({"name": name, "rows": int(ch.text("SELECT count() FROM " + ch.table(name)))})
        manifest = {"app": "litestats", "version": 2,
                    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "release": config.get("LITESTATS_IMAGE") or os.environ.get("LITESTATS_RELEASE", "native"),
                    "clickhouseVersion": ch.text("SELECT version()"),
                    "postgresVersion": psql(config["DATABASE_URL"], "SHOW server_version"),
                    "postgres": pg_counts(config["DATABASE_URL"]), "clickhouse": metadata,
                    "files": {p.name: digest(p) for p in sorted(payload.iterdir())}}
        (payload / "manifest.json").write_text(json.dumps(manifest, indent=2))
        archive = work / "payload.tar"
        with tarfile.open(archive, "w") as tar:
            for path in sorted(payload.iterdir()):
                tar.add(path, arcname=path.name, recursive=False)
        seal(archive, destination, key, work)
    return manifest

def replace_database(url, database):
    u = urlsplit(url)
    return urlunsplit((u.scheme, u.netloc, "/" + quote(database), u.query, u.fragment))

def allow_native_recovery_database(path, user, database, admin):
    """XML-managed accounts cannot receive SQL GRANTs. Extend only their exact allowlist."""
    if os.geteuid()!=0:raise OpsError('Native database access update requires the host operator')
    tree=ET.parse(path)
    users=tree.getroot().find('users')
    entry=next((item for item in users if item.tag==user),None) if users is not None else None
    allowed=entry.find('allow_databases') if entry is not None else None
    if allowed is None:raise OpsError('Expected a native application database allowlist')
    if database not in [item.text for item in allowed]:
        ET.SubElement(allowed,'database').text=database
        mode=Path(path).stat().st_mode & 0o777
        private_write(str(path)+'.before-recovery',Path(path).read_bytes())
        private_write(path,ET.tostring(tree.getroot(),encoding='utf-8'))
        os.chmod(path,mode)
        admin.text('SYSTEM RELOAD CONFIG')

def stage_restore(config_path, source, key_path):
    """Never modify current databases. Keep a private receipt for operator cleanup."""
    config = read_env(config_path)
    with tempfile.TemporaryDirectory(prefix="litestats-restore-") as temporary:
        folder, manifest = unseal(source, Path(temporary), backup_key(key_path))
        # Check all structural fields before creating any target database.
        tables = manifest["clickhouse"]
        for table in tables:
            ident(table["name"])
            if table["name"] + ".native.gz" not in manifest["files"] or table["name"] + ".schema" not in manifest["files"]:
                raise OpsError("Incomplete ClickHouse backup")
        if not {"users", "sites"} <= set(manifest["postgres"]):
            raise OpsError("Not a complete Plost PostgreSQL backup")
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S") + "_" + secrets.token_hex(3)
        target = "litestats_restore_" + stamp
        admin = config.get("PGADMIN_URL") or os.environ.get("PGADMIN_URL") or config["DATABASE_URL"]
        owner = unquote(urlsplit(config["DATABASE_URL"]).username or "postgres")
        ident(owner)
        pg_url = replace_database(config["DATABASE_URL"], target)
        ch_url = replace_database(config["CLICKHOUSE_URL"], target)
        receipt = Path(str(config_path) + ".restore-" + stamp + ".json")
        private_write(receipt, json.dumps({"state": "staging", "postgres": target, "clickhouse": target}))
        psql(admin, "CREATE DATABASE " + ident(target) + " OWNER " + ident(owner))
        run(["pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", "--dbname", target,
             str(folder / "postgres.dump")], env=pg_env(pg_url))
        if pg_counts(pg_url) != manifest["postgres"]:
            raise OpsError("Restored PostgreSQL row counts differ; current databases unchanged")
        old_ch = ClickHouse(config.get("CLICKHOUSE_ADMIN_URL") or os.environ.get("CLICKHOUSE_ADMIN_URL") or config["CLICKHOUSE_URL"])
        old_ch.text("CREATE DATABASE " + ident(target) + " ENGINE=Atomic")
        if os.environ.get('CLICKHOUSE_USERS_CONFIG'):
            allow_native_recovery_database(os.environ['CLICKHOUSE_USERS_CONFIG'],unquote(urlsplit(config['CLICKHOUSE_URL']).username or 'default'),target,old_ch)
        elif config.get("CLICKHOUSE_ADMIN_URL") or os.environ.get("CLICKHOUSE_ADMIN_URL"):
            app_user=unquote(urlsplit(config["CLICKHOUSE_URL"]).username or "default")
            old_ch.text("GRANT ALL ON " + ident(target) + ".* TO " + ident(app_user))
        ch = ClickHouse(ch_url)
        for table in tables:
            name = table["name"]
            schema = (folder / (name + ".schema")).read_text()
            # SHOW CREATE emits a fully qualified leading name. Retain column/engine definitions.
            pattern = r"\ACREATE TABLE (?:`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\.(?:`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)"
            schema, changed = re.subn(pattern, "CREATE TABLE " + ch.table(name), schema, count=1)
            if changed != 1:
                raise OpsError("Unsupported ClickHouse schema; current databases unchanged")
            ch.text(schema)
            with ch.request("INSERT INTO " + ch.table(name) + " FORMAT Native", folder / (name + ".native.gz")) as response:
                response.read()
            if int(ch.text("SELECT count() FROM " + ch.table(name))) != table["rows"]:
                raise OpsError("Restored ClickHouse row counts differ; current databases unchanged")
        saved = read_env(folder / "runtime.env")
        if len(saved.get("SESSION_KEY", "")) < 32:
            raise OpsError("Backup is missing a valid session/encryption key")
        # Preserve target infrastructure credentials, listener/proxy settings and deployment image.
        # Integration secrets live in PostgreSQL and need the original encryption key.
        private_write(str(config_path) + ".before-restore", Path(config_path).read_bytes())
        restored = {key: value for key, value in saved.items()
                    if key == "SESSION_KEY" or key == "ADMIN_EMAILS" or key == "GEOIP_PROVIDER"
                    or key.startswith(("GOOGLE_", "BING_"))}
        restored.update(DATABASE_URL=pg_url, CLICKHOUSE_URL=ch_url)
        patch_env(config_path, restored)
        private_write(receipt, json.dumps({"state": "ready", "postgres": target, "clickhouse": target,
                                          "sourceCreatedAt": manifest["createdAt"]}))
        return manifest

def compose_command():
    if subprocess.run(["docker", "compose", "version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return ["docker", "compose"]
    candidate=shutil.which("docker-compose")
    if candidate:
        return [candidate]
    raise OpsError("Docker Compose v2 is required; install the Compose plugin first")

class Service:
    def __init__(self, args):
        self.args = args
        self.compose = [*compose_command(), "--env-file", str(args.config), "-f", str(args.compose_file)] if args.compose_file else None

    def stop(self):
        if self.args.engine or self.args.service == "none":
            return
        if self.compose:
            run(self.compose + ["stop", "-t", "30", "app"])
        elif self.args.service:
            run(["systemctl", "stop", self.args.service])
        else:
            raise OpsError("Specify --compose-file or --service; backups require a stopped application")

    def start(self):
        if self.args.engine or self.args.service == "none":
            return
        if self.compose:
            run(self.compose + ["up", "-d", "--no-deps", "app"])
        else:
            run(["systemctl", "start", self.args.service])
        url = self.args.health_url
        if not url and self.compose:
            url = "http://127.0.0.1:" + read_env(self.args.config).get("APP_PORT", "3100") + "/api/health"
        if not url:
            raise OpsError("Specify --health-url for native services")
        for _ in range(60):
            try:
                with urlopen(url, timeout=3) as response:
                    if response.status == 200:
                        return
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise OpsError("Application health check failed")

    def operation(self, command):
        args = self.args
        if self.compose and not args.engine:
            directory = args.config.parent.resolve()
            paths = [args.archive.resolve(), args.key_file.resolve()]
            if any(not p.is_relative_to(directory) for p in paths):
                raise OpsError("Compose backup/archive and key must be inside the private instance directory")
            run(self.compose + ["--profile", "ops", "run", "--rm", "--no-deps", "ops", command,
                "--engine", "--config", "/instance/" + args.config.name,
                "--archive", "/instance/" + str(paths[0].relative_to(directory)),
                "--key-file", "/instance/" + str(paths[1].relative_to(directory))])
        elif command == "backup":
            export_backup(args.config, args.archive, args.key_file)
        else:
            stage_restore(args.config, args.archive, args.key_file)

def upgrade_backup_path(directory, now=None):
    current = now or datetime.datetime.now(datetime.timezone.utc)
    backups = Path(directory) / "backups"
    prefix = current.strftime("%Y%m%dT")
    for archive in backups.glob(prefix + "*-upgrade.lsb"):
        if archive.is_file() and not archive.is_symlink() and archive.stat().st_size > 0:
            return None
    return backups / (current.strftime("%Y%m%dT%H%M%S") + "-upgrade.lsb")

def install(args):
    compose_base=compose_command()
    root = Path(__file__).resolve().parent.parent
    directory = args.directory.resolve()
    if directory == root or root in directory.parents:
        raise OpsError("Use a private instance directory outside the source checkout")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    config = directory / ".env"
    if not config.exists():
        secret_pg, secret_ch = secrets.token_hex(24), secrets.token_hex(24)
        values = {"POSTGRES_PASSWORD": secret_pg, "CLICKHOUSE_PASSWORD": secret_ch,
                  "DATABASE_URL": "postgres://litestats:" + secret_pg + "@postgres:5432/litestats",
                  "CLICKHOUSE_URL": "http://litestats:" + secret_ch + "@clickhouse:8123/default",
                  "SESSION_KEY": secrets.token_urlsafe(48), "SEED_DEMO": "false", "GEOIP_PROVIDER": "off",
                  "APP_PORT": str(args.port), "OPS_UID": str(os.getuid()), "OPS_GID": str(os.getgid()), "COMPOSE_PROJECT_NAME": "litestats_" + hashlib.sha256(str(directory).encode()).hexdigest()[:8], "LITESTATS_IMAGE": "litestats:" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")}
        private_write(config, "\n".join(k + "=" + v for k, v in values.items()) + "\n")
    existing=read_env(config)
    missing_identity={key:str(value) for key,value in (("OPS_UID",os.getuid()),("OPS_GID",os.getgid())) if key not in existing}
    if 'LITESTATS_OPS_TOKEN' not in existing:missing_identity['LITESTATS_OPS_TOKEN']=secrets.token_urlsafe(48)
    missing_identity['LITESTATS_OPS_SOCKET']='/run/litestats-ops/ops.sock'
    if missing_identity:patch_env(config,missing_identity)
    socket_dir=directory/'ops-run'
    socket_dir.mkdir(mode=0o755,exist_ok=True)
    os.chmod(socket_dir,0o755)
    backup_key(directory / "backup.key", create=True)
    for name in ("compose.yml", "Ops.Dockerfile", "Ops.Dockerfile.dockerignore", "plost.py", "litestats.py", "ops_agent.py"):
        shutil.copyfile(root / "deploy" / name, directory / name)
    compose = [*compose_base, "--env-file", str(config), "-f", str(directory / "compose.yml")]
    old = config.read_bytes()
    tag = "litestats:" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    run(["docker", "build", "--target", "app", "-t", tag, "-f", str(root / "deploy/Dockerfile"), str(root)])
    run(compose + ["--profile", "ops", "build", "ops"])
    containers=run(compose+["ps","-q","app"]).decode().strip().splitlines()
    if containers:
        status=run(["docker","inspect","--format","{{if .State.Health}}{{.State.Health.Status}}{{end}}",containers[0]]).decode().strip()
        if status=="healthy":
            archive = upgrade_backup_path(directory)
            if archive:
                backup_args=argparse.Namespace(config=config,compose_file=directory/"compose.yml",engine=False,
                    service=None,health_url=None,archive=archive,key_file=directory/"backup.key")
                backup_args.archive.parent.mkdir(mode=0o700,exist_ok=True)
                service=Service(backup_args)
                service.stop()
                try: service.operation("backup")
                finally: service.start()
    patch_env(config, {"LITESTATS_IMAGE": tag})
    try:
        run(compose + ["up", "-d", "--wait", "--wait-timeout", "180", "postgres", "clickhouse", "app"])
        install_agent(directory)
    except Exception:
        private_write(config, old)
        run(compose + ["up", "-d", "--no-deps", "app"])
        raise
    print("Installation ready at http://127.0.0.1:" + read_env(config).get("APP_PORT", "3100"))
    print("Keep the private backup.key separately; configure your HTTPS reverse proxy before public use.")

def install_agent(directory):
    """Linux host supervisor; the web container never receives a Docker socket."""
    if sys.platform!='linux':
        print('Web recovery supervisor requires a Linux systemd host; CLI operations remain available here.')
        return
    if os.geteuid()!=0 or not Path('/run/systemd/system').is_dir():
        raise OpsError('Web backup installation requires root on a systemd Linux host')
    name='litestats-ops-'+hashlib.sha256(str(directory).encode()).hexdigest()[:8]+'.service'
    # systemd syntax, not a shell. Escape specifiers and embedded quotes in paths.
    def arg(value):return '"'+str(value).replace('\\','\\\\').replace('"','\\"').replace('%','%%')+'"'
    command=[sys.executable,directory/'ops_agent.py','--config',directory/'.env',
             '--socket',directory/'ops-run/ops.sock','--backups',directory/'backups',
             '--key-file',directory/'backup.key','--compose-file',directory/'compose.yml']
    unit='[Unit]\nDescription=Plost private backup supervisor\nAfter=docker.service\nRequires=docker.service\n\n[Service]\nType=simple\nUMask=0077\nExecStart='+ ' '.join(arg(item) for item in command)+'\nRestart=on-failure\nRestartSec=3\nPrivateTmp=true\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target\n'
    private_write(Path('/etc/systemd/system')/name,unit)
    run(['systemctl','daemon-reload'])
    run(['systemctl','enable',name])
    run(['systemctl','restart',name])
    run(['systemctl','is-active','--quiet',name])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("install", help="Build and install/upgrade a private Docker Compose instance")
    setup.add_argument("--directory", type=Path, required=True)
    setup.add_argument("--port", type=int, default=3100)
    for name in ("backup", "restore", "verify"):
        p = sub.add_parser(name)
        p.add_argument("--config", type=Path, required=True)
        p.add_argument("--archive", type=Path, required=name!="backup")
        p.add_argument("--key-file", type=Path)
        p.add_argument("--compose-file", type=Path)
        p.add_argument("--service", help="Native systemd service; 'none' is for isolated, stopped test instances only")
        p.add_argument("--health-url")
        p.add_argument("--engine", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    os.umask(0o077)
    if args.command == "install":
        if not 1 <= args.port <= 65535:
            raise OpsError("Invalid port")
        install(args)
        return
    args.config = args.config.resolve()
    args.key_file = args.key_file or args.config.parent / "backup.key"
    if args.command=="backup" and not args.archive:
        args.archive=args.config.parent/"backups"/(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S")+"-"+secrets.token_hex(3)+".lsb")
    if args.command == "verify":
        with tempfile.TemporaryDirectory(prefix="litestats-verify-") as temporary:
            _, manifest = unseal(args.archive, Path(temporary), backup_key(args.key_file))
            print("Verified PostgreSQL + ClickHouse + runtime configuration; created:", manifest["createdAt"])
        return
    service = Service(args)
    if args.service and args.service != "none" and not args.health_url:
        raise OpsError("Native operation requires --health-url before stopping the service")
    with contextlib.ExitStack() as stack:
        if not args.engine:
            lock = stack.enter_context(open(args.config.parent / ".litestats-ops.lock", "a"))
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise OpsError("Another backup or restore is running")
        # Verify archive integrity before taking the application offline.
        if args.command == "restore" and not args.engine:
            with tempfile.TemporaryDirectory(prefix="litestats-verify-") as temporary:
                unseal(args.archive, Path(temporary), backup_key(args.key_file))
        original = args.config.read_bytes()
        service.stop()
        try:
            service.operation(args.command)
            service.start()
        except BaseException:
            if args.command == "restore":
                private_write(args.config, original)
            service.start()
            raise
    print("Complete:", args.command, "(old databases retained after recovery)" if args.command == "restore" else "")

def cli():
    try:
        main()
    except OpsError as error:
        print("Plost: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        # Keep even database/URL/parse error messages out of unattended logs.
        print("Plost operation failed; current database files and recovery candidates have been retained.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    cli()
