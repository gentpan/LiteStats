import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import { db } from "./db"
import { ch } from "./ch"
import { SESSION_KEY } from "./env"

type BackupProvider = "r2" | "s3"
type BackupSchedule = "off" | "hourly" | "daily" | "weekly"

export type BackupSettings = {
  provider: BackupProvider
  endpoint: string
  region: string
  bucket: string
  prefix: string
  access_key: string
  secret_key: string
  schedule: BackupSchedule
  hour: number
  minute: number
  weekday: number
  enabled: boolean
  last_run_at: string | null
  last_status: string | null
  last_error: string | null
  last_backup_id: string | null
}

type BackupManifest = {
  app: "litestats"
  version: 1
  id: string
  createdAt: string
  postgres: { tables: string[], bytes: number }
  clickhouse: { tables: string[], rows: number, parts: string[] }
}

const SKIP_RESTORE = new Set(["litestats_backup_settings", "schema_migrations"])

function key() {
  return createHash("sha256").update(SESSION_KEY).digest()
}

function encrypt(plain: string) {
  if (!plain) return ""
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", key(), iv)
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()])
  const tag = c.getAuthTag()
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`
}

function decrypt(value: string) {
  if (!value) return ""
  if (!value.startsWith("enc:")) return value
  const [, ivb, tagb, datab] = value.split(":")
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivb, "base64"))
  d.setAuthTag(Buffer.from(tagb, "base64"))
  return Buffer.concat([d.update(Buffer.from(datab, "base64")), d.final()]).toString("utf8")
}

async function ensureTable() {
  await (await db()).query(`
    CREATE TABLE IF NOT EXISTS litestats_backup_settings (
      id int PRIMARY KEY DEFAULT 1,
      provider text NOT NULL DEFAULT 'r2',
      endpoint text DEFAULT '',
      region text DEFAULT 'auto',
      bucket text DEFAULT '',
      prefix text DEFAULT 'litestats',
      access_key text DEFAULT '',
      secret_key text DEFAULT '',
      schedule text DEFAULT 'daily',
      hour int DEFAULT 3,
      minute int DEFAULT 0,
      weekday int DEFAULT 0,
      enabled boolean DEFAULT false,
      last_run_at timestamptz,
      last_status text,
      last_error text,
      last_backup_id text,
      updated_at timestamptz DEFAULT now()
    )
  `)
  await (await db()).query(`INSERT INTO litestats_backup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
}

export async function getBackupSettings(): Promise<BackupSettings> {
  await ensureTable()
  const res = await (await db()).query<BackupSettings>(`SELECT * FROM litestats_backup_settings WHERE id = 1`)
  const row = res.rows[0]
  return {
    ...row,
    access_key: decrypt(row.access_key || ""),
    secret_key: decrypt(row.secret_key || ""),
  }
}

export async function saveBackupSettings(patch: Partial<BackupSettings>) {
  await ensureTable()
  const cur = await getBackupSettings()
  const next = { ...cur, ...patch }
  await (await db()).query(
    `UPDATE litestats_backup_settings SET
      provider=$1, endpoint=$2, region=$3, bucket=$4, prefix=$5,
      access_key=$6, secret_key=$7, schedule=$8, hour=$9, minute=$10, weekday=$11,
      enabled=$12, updated_at=now()
     WHERE id = 1`,
    [
      next.provider, next.endpoint, next.region, next.bucket, next.prefix,
      encrypt(next.access_key), encrypt(next.secret_key),
      next.schedule, next.hour, next.minute, next.weekday, next.enabled,
    ],
  )
}

async function s3Sdk() {
  try {
    return await import("@aws-sdk/client-s3")
  } catch {
    throw new Error("Missing @aws-sdk/client-s3 module. Run `bun add @aws-sdk/client-s3` to enable S3/R2 backup.")
  }
}

async function clientOf(s: BackupSettings) {
  if (!s.bucket || !s.access_key || !s.secret_key) throw new Error("请先填写存储桶和密钥")
  const { S3Client } = await s3Sdk()
  return new S3Client({
    region: s.region || "auto",
    endpoint: s.endpoint || undefined,
    forcePathStyle: s.provider === "r2" || !!s.endpoint,
    credentials: { accessKeyId: s.access_key, secretAccessKey: s.secret_key },
  })
}

function prefixOf(s: BackupSettings) {
  return (s.prefix || "litestats").replace(/^\/+|\/+$/g, "")
}

async function put(s: BackupSettings, keyPath: string, body: Buffer, contentType: string) {
  const { PutObjectCommand } = await s3Sdk()
  const client = await clientOf(s)
  await client.send(new PutObjectCommand({
    Bucket: s.bucket,
    Key: keyPath,
    Body: body,
    ContentType: contentType,
  }))
}

async function getBuf(s: BackupSettings, keyPath: string) {
  const { GetObjectCommand } = await s3Sdk()
  const client = await clientOf(s)
  const res = await client.send(new GetObjectCommand({ Bucket: s.bucket, Key: keyPath }))
  const bytes = await res.Body?.transformToByteArray()
  if (!bytes) throw new Error("备份文件为空")
  return Buffer.from(bytes)
}

async function dumpPostgres() {
  const client = await (await db()).connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const tables = await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    const out: Record<string, unknown[]> = {}
    for (const { tablename } of tables.rows) {
      const rows = await client.query(`SELECT * FROM ${quoteIdent(tablename)}`)
      out[tablename] = rows.rows.map(serializeRow)
    }
    await client.query("COMMIT")
    return { tables: Object.keys(out), json: JSON.stringify(out) }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}

function quoteIdent(name: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("非法表名")
  return `"${name}"`
}

function serializeRow(row: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) next[k] = v.toISOString()
    else if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) next[k] = { $buf: v.toString("base64") }
    else next[k] = v
  }
  return next
}

async function dumpClickhouse() {
  const parts: Array<{ name: string, body: Buffer, rows: number }> = []
  let batch: string[] = []
  let total = 0
  const pack = () => {
    if (!batch.length) return
    parts.push({ name: `clickhouse/events_v2.${String(parts.length).padStart(4, "0")}.jsonl.gz`, body: gzipSync(Buffer.from(batch.join("\n"))), rows: batch.length })
    batch = []
  }
  // A single query reads one ClickHouse snapshot; OFFSET pagination can skip concurrent rows.
  const result = await ch().query({ query: "SELECT * FROM events_v2", format: "JSONEachRow" })
  for await (const rows of result.stream()) {
    for (const row of rows) {
      batch.push(row.text)
      total++
      if (batch.length === 20000) pack()
    }
  }
  pack()
  return { parts, rows: total }
}

export async function runBackup(reason = "manual") {
  const s = await getBackupSettings()
  const id = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
  const base = `${prefixOf(s)}/backups/${id}`
  const pg = await dumpPostgres()
  const chDump = await dumpClickhouse()
  const pgBuf = gzipSync(Buffer.from(pg.json))
  await put(s, `${base}/postgres.json.gz`, pgBuf, "application/gzip")
  for (const part of chDump.parts) {
    await put(s, `${base}/${part.name}`, part.body, "application/gzip")
  }
  const manifest: BackupManifest = {
    app: "litestats",
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    postgres: { tables: pg.tables, bytes: pgBuf.length },
    clickhouse: { tables: ["events_v2"], rows: chDump.rows, parts: chDump.parts.map((p) => p.name) },
  }
  await put(s, `${base}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), "application/json")
  await (await db()).query(
    `UPDATE litestats_backup_settings SET last_run_at = now(), last_status = $1, last_error = NULL, last_backup_id = $2, updated_at = now() WHERE id = 1`,
    [reason, id],
  )
  return manifest
}

export async function scanBackups(override?: Partial<BackupSettings>) {
  const s = override ? { ...await getBackupSettings(), ...override } : await getBackupSettings()
  const { ListObjectsV2Command } = await s3Sdk()
  const client = await clientOf(s)
  const listed = await client.send(new ListObjectsV2Command({
    Bucket: s.bucket,
    Prefix: `${prefixOf(s)}/backups/`,
  }))
  const keys = (listed.Contents || []).map((o) => o.Key || "").filter((k) => k.endsWith("/manifest.json"))
  const items: BackupManifest[] = []
  for (const keyPath of keys.slice(-40)) {
    try {
      const buf = await getBuf(s, keyPath)
      const man = JSON.parse(buf.toString("utf8")) as BackupManifest
      if (man.app === "litestats") items.push(man)
    } catch {
      /* skip broken */
    }
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return items
}

export async function restoreBackup(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("非法备份 ID")
  const s = await getBackupSettings()
  const base = `${prefixOf(s)}/backups/${id}`
  const manifest = JSON.parse((await getBuf(s, `${base}/manifest.json`)).toString("utf8")) as BackupManifest
  if (manifest.app !== "litestats" || manifest.version !== 1 || !manifest.clickhouse?.tables?.includes("events_v2")) throw new Error("不支持的备份格式")
  const tables = JSON.parse(gunzipSync(await getBuf(s, `${base}/postgres.json.gz`)).toString("utf8")) as Record<string, Array<Record<string, unknown>>>
  const stage = `events_restore_${randomBytes(8).toString("hex")}`
  await ch().command({query: `CREATE TABLE ${stage} AS events_v2`})
  let exchanged = false
  let committed = false
  try {
    // Validate and stage all event parts before changing either live database.
    let count = 0
    for (const part of manifest.clickhouse.parts) {
      if (!/^clickhouse\/events_v2\.\d+\.jsonl\.gz$/.test(part)) throw new Error("非法备份分片")
      const rows = gunzipSync(await getBuf(s, `${base}/${part}`)).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
      count += rows.length
      if (rows.length) await ch().insert({table: stage, format: "JSONEachRow", values: rows})
    }
    if (count !== manifest.clickhouse.rows) throw new Error("备份事件数量校验失败")
    const client = await (await db()).connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(817325)")
      await client.query("SET LOCAL session_replication_role = replica")
      for (const [table, rows] of Object.entries(tables)) {
        if (SKIP_RESTORE.has(table)) continue
        if (!Array.isArray(rows)) throw new Error("非法备份表数据")
        await client.query(`DELETE FROM ${quoteIdent(table)}`)
        for (const row of rows) {
          const cols = Object.keys(row)
          await client.query(`INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(", ")})`, cols.map(col => revive(row[col])))
        }
      }
      const sequences = await client.query<{table_name:string,column_name:string,sequence:string}>(`SELECT table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) AS sequence FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'`)
      for (const row of sequences.rows) {
        if (!row.sequence || SKIP_RESTORE.has(row.table_name)) continue
        await client.query(`SELECT setval($1, COALESCE((SELECT max(${quoteIdent(row.column_name)}) FROM ${quoteIdent(row.table_name)}),1), EXISTS(SELECT 1 FROM ${quoteIdent(row.table_name)}))`, [row.sequence])
      }
      await ch().command({query:`EXCHANGE TABLES events_v2 AND ${stage}`})
      exchanged = true
      await client.query("COMMIT")
      committed = true
    } catch (error) {
      await client.query("ROLLBACK")
      if (exchanged) { await ch().command({query:`EXCHANGE TABLES events_v2 AND ${stage}`}); exchanged = false }
      throw error
    } finally { client.release() }
    return manifest
  } finally {
    // Retain the old table if an exchange rollback failed, for manual recovery.
    if (!exchanged || committed) await ch().command({query:`DROP TABLE IF EXISTS ${stage}`})
  }
}

function revive(v: unknown) {
  if (v && typeof v === "object" && "$buf" in (v as { $buf?: string })) {
    return Buffer.from((v as { $buf: string }).$buf, "base64")
  }
  return v
}

let started = false
export function startBackupScheduler() {
  if (started || typeof setInterval === "undefined") return
  started = true
  const tick = async () => {
    try {
      const s = await getBackupSettings()
      if (!s.enabled || s.schedule === "off" || !s.bucket) return
      const last = s.last_run_at ? new Date(s.last_run_at).getTime() : 0
      const now = new Date()
      let due = false
      if (s.schedule === "hourly") due = Date.now() - last > 60 * 60 * 1000
      if (s.schedule === "daily") {
        const target = new Date(now)
        target.setHours(s.hour, s.minute, 0, 0)
        due = now >= target && (!last || new Date(last).toDateString() !== now.toDateString())
      }
      if (s.schedule === "weekly") {
        const target = new Date(now)
        target.setHours(s.hour, s.minute, 0, 0)
        due = now.getDay() === s.weekday && now >= target && Date.now() - last > 6 * 24 * 60 * 60 * 1000
      }
      if (due) await runBackup("schedule")
    } catch (err) {
      await (await db()).query(
        `UPDATE litestats_backup_settings SET last_status = 'error', last_error = $1, updated_at = now() WHERE id = 1`,
        [err instanceof Error ? err.message : "备份失败"],
      ).catch(() => undefined)
    }
  }
  setInterval(() => { void tick() }, 60_000)
  setTimeout(() => { void tick() }, 15_000)
}
