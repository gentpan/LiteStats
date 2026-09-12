import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { db } from "./db"
import { ch } from "./ch"
import { SESSION_KEY } from "./env"

export type BackupProvider = "r2" | "s3"
export type BackupSchedule = "off" | "hourly" | "daily" | "weekly"

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

export type BackupManifest = {
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

function clientOf(s: BackupSettings) {
  if (!s.bucket || !s.access_key || !s.secret_key) throw new Error("请先填写存储桶和密钥")
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
  await clientOf(s).send(new PutObjectCommand({
    Bucket: s.bucket,
    Key: keyPath,
    Body: body,
    ContentType: contentType,
  }))
}

async function getBuf(s: BackupSettings, keyPath: string) {
  const res = await clientOf(s).send(new GetObjectCommand({ Bucket: s.bucket, Key: keyPath }))
  const bytes = await res.Body?.transformToByteArray()
  if (!bytes) throw new Error("备份文件为空")
  return Buffer.from(bytes)
}

async function dumpPostgres() {
  const client = await db()
  const tables = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  )
  const out: Record<string, unknown[]> = {}
  for (const { tablename } of tables.rows) {
    const rows = await client.query(`SELECT * FROM ${quoteIdent(tablename)}`)
    out[tablename] = rows.rows.map(serializeRow)
  }
  return { tables: Object.keys(out), json: JSON.stringify(out) }
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
  const page = 20000
  let offset = 0
  let index = 0
  let total = 0
  while (true) {
    const res = await ch().query({
      query: `SELECT * FROM events_v2 ORDER BY timestamp LIMIT ${page} OFFSET ${offset} FORMAT JSONEachRow`,
      format: "JSONEachRow",
    })
    const rows = await res.json<Record<string, unknown>>()
    if (!rows.length) break
    const text = rows.map((r) => JSON.stringify(r)).join("\n")
    parts.push({
      name: `clickhouse/events_v2.${String(index).padStart(4, "0")}.jsonl.gz`,
      body: gzipSync(Buffer.from(text)),
      rows: rows.length,
    })
    total += rows.length
    offset += page
    index += 1
    if (rows.length < page) break
    if (index > 200) break
  }
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
  const listed = await clientOf(s).send(new ListObjectsV2Command({
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
  const s = await getBackupSettings()
  const base = `${prefixOf(s)}/backups/${id}`
  const manifest = JSON.parse((await getBuf(s, `${base}/manifest.json`)).toString("utf8")) as BackupManifest
  const pgBuf = gunzipSync(await getBuf(s, `${base}/postgres.json.gz`))
  const tables = JSON.parse(pgBuf.toString("utf8")) as Record<string, Array<Record<string, unknown>>>
  const client = await db()
  await client.query("BEGIN")
  try {
    await client.query("SET LOCAL session_replication_role = replica")
    for (const [table, rows] of Object.entries(tables)) {
      if (SKIP_RESTORE.has(table) || !/^[a-z_][a-z0-9_]*$/i.test(table)) continue
      await client.query(`DELETE FROM ${quoteIdent(table)}`)
      if (!rows.length) continue
      const cols = Object.keys(rows[0])
      for (const row of rows) {
        const values = cols.map((c) => revive(row[c]))
        const ph = cols.map((_, i) => `$${i + 1}`).join(", ")
        await client.query(
          `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${ph})`,
          values,
        )
      }
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  }

  const parts = manifest.clickhouse?.parts || []
  if (parts.length) {
    await ch().command({ query: "TRUNCATE TABLE IF EXISTS events_v2" }).catch(async () => {
      await ch().command({ query: "ALTER TABLE events_v2 DELETE WHERE 1" })
    })
    for (const part of parts) {
      const text = gunzipSync(await getBuf(s, `${base}/${part}`)).toString("utf8")
      const rows = text.split("\n").filter(Boolean).map((line) => JSON.parse(line))
      if (rows.length) {
        await ch().insert({ table: "events_v2", format: "JSONEachRow", values: rows })
      }
    }
  }
  return manifest
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
