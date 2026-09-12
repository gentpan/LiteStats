import { execFile } from "node:child_process"
import { hostname, loadavg, totalmem, freemem, uptime, cpus, platform, release, arch, type as osType } from "node:os"
import { readFile, readdir } from "node:fs/promises"
import { promisify } from "node:util"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { db } from "./db"
import type { MonitorMetrics, MonitorServer } from "./monitor-view"

export type { MonitorMetrics, MonitorServer }

export type MonitorServerRow = MonitorServer & {
  secret?: string
  hidden?: boolean
  meta?: Record<string, unknown>
}

const execFileAsync = promisify(execFile)
const HISTORY_KEEP_DAYS = 7

type Snapshot = {
  at: number
  idle: number
  busy: number
  rx: number
  tx: number
}

let started = false
let prev: Snapshot | null = null

export async function ensureMonitorTables() {
  const pool = await db()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_servers (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      secret varchar(255) NOT NULL,
      kind varchar(16) NOT NULL DEFAULT 'agent',
      hidden boolean NOT NULL DEFAULT false,
      position integer NOT NULL DEFAULT 0,
      last_seen_at timestamptz,
      latest_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`ALTER TABLE monitor_servers ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_settings (
      key varchar(64) PRIMARY KEY,
      value jsonb NOT NULL
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitor_samples (
      id bigserial PRIMARY KEY,
      server_id varchar(64) NOT NULL REFERENCES monitor_servers(id) ON DELETE CASCADE,
      collected_at timestamptz NOT NULL,
      metrics jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS monitor_servers_position_index ON monitor_servers (position)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS monitor_samples_server_collected_index ON monitor_samples (server_id, collected_at)`)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'monitor_servers'
          AND column_name = 'last_seen_at'
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE monitor_servers
          ALTER COLUMN last_seen_at TYPE timestamptz
          USING last_seen_at AT TIME ZONE 'UTC';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'monitor_samples'
          AND column_name = 'collected_at'
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE monitor_samples
          ALTER COLUMN collected_at TYPE timestamptz
          USING collected_at AT TIME ZONE 'UTC';
      END IF;
    END $$
  `)
}

export function startMonitorCollector() {
  if (started) return
  started = true
  void tick().catch(() => {})
  setInterval(() => {
    void tick().catch(() => {})
  }, 15_000)
}

export async function startMonitorCollectorNow() {
  if (!started) {
    started = true
    await tick().catch(() => {})
    setInterval(() => {
      void tick().catch(() => {})
    }, 15_000)
    return
  }
  if (!prev) await tick().catch(() => {})
}

async function tick() {
  await ensureMonitorTables()
  const server = await ensureLocalServer()
  const snap = await takeSnapshot()
  const metrics = await toMetrics(snap, prev)
  prev = snap
  await recordSample(server.id, metrics)
}

export type MonitorHistoryPoint = {
  at: string
  cpu: number | null
  ram_used: number | null
  ram_total: number | null
  swap_used: number | null
  swap_total: number | null
  disk_used: number | null
  disk_total: number | null
  net_in_speed: number | null
  net_out_speed: number | null
  load1: number | null
  load5: number | null
  load15: number | null
  processes: number | null
  tcp_conn: number | null
  udp_conn: number | null
  ping_ct: number | null
  ping_cu: number | null
  ping_cm: number | null
  ping_bd: number | null
}

function isoTimestamp(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function historyStepSeconds(hours: number) {
  if (hours <= 0.25) return 15
  if (hours <= 1) return 60
  if (hours <= 6) return 120
  if (hours <= 24) return 300
  return 1800
}

export async function getMonitorServer(id: string): Promise<MonitorServerRow | null> {
  await ensureMonitorTables()
  const res = await (await db()).query<MonitorServerRow>(
    `SELECT id, name, kind, last_seen_at, COALESCE(latest_metrics, '{}'::jsonb) AS latest_metrics,
            position, COALESCE(hidden, false) AS hidden, COALESCE(meta, '{}'::jsonb) AS meta
     FROM monitor_servers
     WHERE id = $1 AND COALESCE(hidden, false) = false`,
    [id],
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    ...row,
    last_seen_at: isoTimestamp(row.last_seen_at),
    latest_metrics: (row.latest_metrics || {}) as MonitorMetrics,
    meta: (row.meta || {}) as Record<string, unknown>,
  }
}

export async function getMonitorHistory(id: string, hours: number): Promise<MonitorHistoryPoint[]> {
  await ensureMonitorTables()
  const span = Math.min(Math.max(hours, 0.1), 24 * HISTORY_KEEP_DAYS)
  const step = historyStepSeconds(span)
  const res = await (await db()).query<{
    at: Date
    cpu: number | null
    ram_used: number | null
    ram_total: number | null
    swap_used: number | null
    swap_total: number | null
    disk_used: number | null
    disk_total: number | null
    net_in_speed: number | null
    net_out_speed: number | null
    load1: number | null
    load5: number | null
    load15: number | null
    processes: number | null
    tcp_conn: number | null
    udp_conn: number | null
    ping_ct: number | null
    ping_cu: number | null
    ping_cm: number | null
    ping_bd: number | null
  }>(
    `SELECT
       to_timestamp(floor(extract(epoch from collected_at) / $3) * $3) AS at,
       AVG(CASE WHEN metrics->>'cpu' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'cpu')::float END) AS cpu,
       AVG(CASE WHEN metrics->>'ram_used' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'ram_used')::float END) AS ram_used,
       AVG(CASE WHEN metrics->>'ram_total' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'ram_total')::float END) AS ram_total,
       AVG(CASE WHEN metrics->>'swap_used' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'swap_used')::float END) AS swap_used,
       AVG(CASE WHEN metrics->>'swap_total' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'swap_total')::float END) AS swap_total,
       AVG(CASE WHEN metrics->>'disk_used' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'disk_used')::float END) AS disk_used,
       AVG(CASE WHEN metrics->>'disk_total' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'disk_total')::float END) AS disk_total,
       AVG(CASE WHEN metrics->>'net_in_speed' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'net_in_speed')::float END) AS net_in_speed,
       AVG(CASE WHEN metrics->>'net_out_speed' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'net_out_speed')::float END) AS net_out_speed,
       AVG(CASE WHEN split_part(COALESCE(metrics->>'load_avg',''), ' ', 1) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN split_part(metrics->>'load_avg', ' ', 1)::float END) AS load1,
       AVG(CASE WHEN split_part(COALESCE(metrics->>'load_avg',''), ' ', 2) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN split_part(metrics->>'load_avg', ' ', 2)::float END) AS load5,
       AVG(CASE WHEN split_part(COALESCE(metrics->>'load_avg',''), ' ', 3) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN split_part(metrics->>'load_avg', ' ', 3)::float END) AS load15,
       AVG(CASE WHEN metrics->>'processes' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'processes')::float END) AS processes,
       AVG(CASE WHEN metrics->>'tcp_conn' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'tcp_conn')::float END) AS tcp_conn,
       AVG(CASE WHEN metrics->>'udp_conn' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'udp_conn')::float END) AS udp_conn,
       AVG(CASE WHEN metrics->>'ping_ct' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'ping_ct')::float END) AS ping_ct,
       AVG(CASE WHEN metrics->>'ping_cu' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'ping_cu')::float END) AS ping_cu,
       AVG(CASE WHEN metrics->>'ping_cm' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'ping_cm')::float END) AS ping_cm,
       AVG(CASE WHEN metrics->>'ping_bd' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (metrics->>'ping_bd')::float END) AS ping_bd
     FROM monitor_samples
     WHERE server_id = $1 AND collected_at >= now() - ($2 || ' hours')::interval
     GROUP BY 1
     ORDER BY 1`,
    [id, String(span), step],
  )
  return res.rows.map((row) => ({
    ...row,
    at: new Date(row.at).toISOString(),
  }))
}

export async function listMonitorServers(): Promise<MonitorServerRow[]> {
  await ensureMonitorTables()
  await ensureLocalServer()
  await startMonitorCollectorNow()
  const res = await (await db()).query<MonitorServerRow>(
    `SELECT id, name, kind, last_seen_at, COALESCE(latest_metrics, '{}'::jsonb) AS latest_metrics,
            position, COALESCE(hidden, false) AS hidden, COALESCE(meta, '{}'::jsonb) AS meta
     FROM monitor_servers
     WHERE COALESCE(hidden, false) = false
     ORDER BY position, inserted_at`,
  )
  return res.rows.map((row) => ({
    ...row,
    last_seen_at: isoTimestamp(row.last_seen_at),
    latest_metrics: (row.latest_metrics || {}) as MonitorMetrics,
    meta: (row.meta || {}) as Record<string, unknown>,
  }))
}

export async function listMonitorServersAdmin(): Promise<MonitorServerRow[]> {
  await ensureMonitorTables()
  await ensureLocalServer()
  await startMonitorCollectorNow()
  const res = await (await db()).query<MonitorServerRow>(
    `SELECT id, name, kind, secret, last_seen_at, COALESCE(latest_metrics, '{}'::jsonb) AS latest_metrics,
            position, COALESCE(hidden, false) AS hidden, COALESCE(meta, '{}'::jsonb) AS meta
     FROM monitor_servers
     ORDER BY position, inserted_at`,
  )
  return res.rows.map((row) => ({
    ...row,
    last_seen_at: isoTimestamp(row.last_seen_at),
    latest_metrics: (row.latest_metrics || {}) as MonitorMetrics,
    meta: (row.meta || {}) as Record<string, unknown>,
  }))
}

export async function createMonitorServer(name: string) {
  await ensureMonitorTables()
  const count = await (await db()).query<{ n: string }>(`SELECT count(*)::text AS n FROM monitor_servers`)
  const id = crypto.randomUUID()
  const secret = randomBytes(24).toString("base64url")
  const trimmed = name.trim() || `服务器 ${Number(count.rows[0].n) + 1}`
  const pos = await (await db()).query<{ n: string }>(`SELECT COALESCE(max(position), 0)::text AS n FROM monitor_servers`)
  await (await db()).query(
    `INSERT INTO monitor_servers (id, name, secret, kind, position, latest_metrics, inserted_at, updated_at)
     VALUES ($1, $2, $3, 'agent', $4, '{}'::jsonb, now(), now())`,
    [id, trimmed, secret, Number(pos.rows[0].n) + 1],
  )
  return { id, name: trimmed, secret, kind: "agent" as const }
}

export async function getMonitorServerSecret(id: string) {
  const row = await (await db()).query<{ id: string, name: string, secret: string, kind: string }>(
    `SELECT id, name, secret, kind FROM monitor_servers WHERE id = $1`,
    [id],
  )
  if (!row.rows[0]) throw new Error("找不到服务器")
  if (row.rows[0].kind === "local") throw new Error("本机 LiteStats 主机会自动采集，不用再装探针")
  return { id: row.rows[0].id, name: row.rows[0].name, secret: row.rows[0].secret }
}

export async function deleteMonitorServer(id: string) {
  const row = await (await db()).query<{ kind: string }>(`SELECT kind FROM monitor_servers WHERE id = $1`, [id])
  if (!row.rows[0]) throw new Error("找不到服务器")
  if (row.rows[0].kind === "local") throw new Error("不能删除本机 LiteStats 主机")
  await (await db()).query(`DELETE FROM monitor_servers WHERE id = $1`, [id])
}

export async function ingestMonitor(payload: Record<string, unknown>) {
  const id = String(payload.id || "")
  const secret = String(payload.secret || "")
  if (!id || !secret) return { error: "bad_request" as const }
  const row = await (await db()).query<{ secret: string }>(`SELECT secret FROM monitor_servers WHERE id = $1`, [id])
  if (!row.rows[0]) return { error: "not_found" as const }
  const expected = Buffer.from(row.rows[0].secret)
  const provided = Buffer.from(secret)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { error: "unauthorized" as const }
  }
  await recordSample(id, extractMetrics(payload))
  return { ok: true as const }
}

async function ensureLocalServer() {
  const existing = await (await db()).query<{ id: string }>(`SELECT id FROM monitor_servers WHERE kind = 'local' LIMIT 1`)
  if (existing.rows[0]) return existing.rows[0]
  const secret = randomBytes(24).toString("base64url")
  await (await db()).query(
    `INSERT INTO monitor_servers (id, name, secret, kind, position, latest_metrics, inserted_at, updated_at)
     VALUES ('local', $1, $2, 'local', 0, '{}'::jsonb, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [hostname() || "本机", secret],
  )
  return { id: "local" }
}

async function recordSample(serverId: string, metrics: MonitorMetrics) {
  const pool = await db()
  await pool.query(
    `UPDATE monitor_servers SET last_seen_at = now(), latest_metrics = $2::jsonb, updated_at = now() WHERE id = $1`,
    [serverId, JSON.stringify(metrics)],
  )
  await pool.query(
    `INSERT INTO monitor_samples (server_id, collected_at, metrics) VALUES ($1, now(), $2::jsonb)`,
    [serverId, JSON.stringify(metrics)],
  )
  await pool.query(
    `DELETE FROM monitor_samples WHERE server_id = $1 AND collected_at < now() - ($2 || ' days')::interval`,
    [serverId, String(HISTORY_KEEP_DAYS)],
  )
}

function extractMetrics(payload: Record<string, unknown>): MonitorMetrics {
  const nested = payload.metrics
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return stringifyKeys(nested as Record<string, unknown>)
  }
  return stringifyKeys(payload)
}

function stringifyKeys(map: Record<string, unknown>): MonitorMetrics {
  const out: MonitorMetrics = {}
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      out[key] = value
    }
  }
  return out
}

async function takeSnapshot(): Promise<Snapshot> {
  const cpu = sampleCpu()
  const net = await netCounters()
  return { at: Date.now(), idle: cpu.idle, busy: cpu.busy, rx: net.rx, tx: net.tx }
}

function sampleCpu() {
  const list = cpus() || []
  let idle = 0
  let busy = 0
  for (const cpu of list) {
    idle += cpu.times.idle
    busy += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq
  }
  return { idle, busy }
}

async function toMetrics(snap: Snapshot, last: Snapshot | null): Promise<MonitorMetrics> {
  const mem = await memoryInfo()
  const swap = await swapInfo()
  const disk = await diskInfo()
  const net = netSpeed(snap, last)
  return {
    cpu: Number(cpuPercent(snap, last).toFixed(2)),
    ram_total: mem.total,
    ram_used: mem.used,
    swap_total: swap.total,
    swap_used: swap.used,
    disk_total: disk.total,
    disk_used: disk.used,
    load_avg: loadavg().map((n) => n.toFixed(2)).join(" "),
    boot_time: Math.max(0, Date.now() - uptime() * 1000),
    net_rx: snap.rx,
    net_tx: snap.tx,
    net_in_speed: net.in,
    net_out_speed: net.out,
    os: await osName(),
    arch: arch(),
    kernel_version: `${osType()} ${release()}`,
    cpu_info: (cpus()[0]?.model || "CPU").trim(),
    cpu_cores: cpus().length,
    processes: await processCount(),
    tcp_conn: await sockCount("tcp"),
    udp_conn: await sockCount("udp"),
    ping_ct: false,
    ping_cu: false,
    ping_cm: false,
    ping_bd: false,
  }
}

function cpuPercent(current: Snapshot, last: Snapshot | null) {
  if (!last) {
    const total = current.idle + current.busy
    return total > 0 ? (current.busy / total) * 100 : 0
  }
  const dIdle = Math.max(current.idle - last.idle, 0)
  const dBusy = Math.max(current.busy - last.busy, 0)
  const total = dIdle + dBusy
  return total > 0 ? (dBusy / total) * 100 : 0
}

function netSpeed(current: Snapshot, last: Snapshot | null) {
  if (!last) return { in: 0, out: 0 }
  const dt = Math.max(current.at - last.at, 1) / 1000
  return {
    in: Math.max(Math.trunc((current.rx - last.rx) / dt), 0),
    out: Math.max(Math.trunc((current.tx - last.tx) / dt), 0),
  }
}

async function memoryInfo() {
  const total = Math.round(totalmem() / 1024 / 1024)
  try {
    const contents = await readFile("/proc/meminfo", "utf8")
    const kb = (key: string) => Number((contents.match(new RegExp(`${key}:\\s+(\\d+)`)) || [])[1] || 0)
    const used = Math.max(kb("MemTotal") - kb("MemAvailable"), 0)
    return { total: Math.round(kb("MemTotal") / 1024), used: Math.round(used / 1024) }
  } catch {
    const used = Math.max(total - Math.round(freemem() / 1024 / 1024), 0)
    return { total, used }
  }
}

async function swapInfo() {
  try {
    const contents = await readFile("/proc/meminfo", "utf8")
    const kb = (key: string) => Number((contents.match(new RegExp(`${key}:\\s+(\\d+)`)) || [])[1] || 0)
    const total = kb("SwapTotal")
    const used = Math.max(total - kb("SwapFree"), 0)
    return { total: Math.round(total / 1024), used: Math.round(used / 1024) }
  } catch {
    return { total: 0, used: 0 }
  }
}

async function diskInfo() {
  try {
    const { stdout } = await execFileAsync("df", ["-kP", "/"])
    const line = stdout.trim().split("\n")[1]
    const parts = line?.split(/\s+/) || []
    return { total: Math.round(Number(parts[1] || 0) / 1024), used: Math.round(Number(parts[2] || 0) / 1024) }
  } catch {
    return { total: 0, used: 0 }
  }
}

async function netCounters() {
  try {
    const contents = await readFile("/proc/net/dev", "utf8")
    let rx = 0
    let tx = 0
    for (const line of contents.split("\n").slice(2)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10) continue
      const iface = parts[0].replace(/:$/, "")
      if (iface === "lo" || iface === "lo0" || iface.startsWith("docker") || iface.startsWith("veth") || iface.startsWith("br-")) continue
      rx += Number(parts[1] || 0)
      tx += Number(parts[9] || 0)
    }
    return { rx, tx }
  } catch {
    return { rx: 0, tx: 0 }
  }
}

async function osName() {
  try {
    const contents = await readFile("/etc/os-release", "utf8")
    const match = contents.match(/^PRETTY_NAME="?([^"\n]+)"?/m)
    if (match) return match[1]
  } catch {
    if (platform() === "darwin") return "macOS"
  }
  return platform()
}

async function processCount() {
  try {
    const entries = await readdir("/proc")
    return entries.filter((name) => /^\d+$/.test(name)).length
  } catch {
    try {
      const { stdout } = await execFileAsync("ps", ["-A"])
      return Math.max(stdout.trim().split("\n").length - 1, 0)
    } catch {
      return 0
    }
  }
}

async function sockCount(kind: "tcp" | "udp") {
  try {
    const contents = await readFile("/proc/net/sockstat", "utf8")
    const key = kind === "tcp" ? "TCP" : "UDP"
    const match = contents.match(new RegExp(`${key}:\\s+inuse\\s+(\\d+)`))
    return Number(match?.[1] || 0)
  } catch {
    return 0
  }
}

export async function getMonitorServerAdmin(id: string): Promise<MonitorServerRow | null> {
  await ensureMonitorTables()
  const res = await (await db()).query<MonitorServerRow>(
    `SELECT id, name, kind, secret, last_seen_at, COALESCE(latest_metrics, '{}'::jsonb) AS latest_metrics,
            position, COALESCE(hidden, false) AS hidden, COALESCE(meta, '{}'::jsonb) AS meta
     FROM monitor_servers
     WHERE id = $1`,
    [id],
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    ...row,
    last_seen_at: isoTimestamp(row.last_seen_at),
    latest_metrics: (row.latest_metrics || {}) as MonitorMetrics,
    meta: (row.meta || {}) as Record<string, unknown>,
  }
}

export async function getCfsmHistory(id: string, hours: number): Promise<Record<string, unknown>[]> {
  await ensureMonitorTables()
  const span = Math.min(Math.max(hours, 0.1), 24 * HISTORY_KEEP_DAYS)
  const step = historyStepSeconds(span)
  const res = await (await db()).query<{ collected_at: Date, metrics: MonitorMetrics }>(
    `SELECT DISTINCT ON (bucket)
       collected_at,
       metrics
     FROM (
       SELECT
         collected_at,
         COALESCE(metrics, '{}'::jsonb) AS metrics,
         floor(extract(epoch from collected_at) / $3)::bigint AS bucket
       FROM monitor_samples
       WHERE server_id = $1 AND collected_at >= now() - ($2 || ' hours')::interval
     ) t
     ORDER BY bucket, collected_at`,
    [id, String(span), step],
  )
  return res.rows.map((row) => flattenHistoryMetrics(row.collected_at, row.metrics || {}))
}

export type LatencyWindow = {
  ping: Array<Record<string, unknown>>
  loss: Array<Record<string, unknown>>
}

export async function getLatencyWindows(serverIds: string[], points = 20, hours = 2): Promise<Map<string, LatencyWindow>> {
  const out = new Map<string, LatencyWindow>()
  if (serverIds.length === 0) return out
  await ensureMonitorTables()
  const res = await (await db()).query<{ server_id: string, collected_at: Date, metrics: MonitorMetrics }>(
    `SELECT server_id, collected_at, COALESCE(metrics, '{}'::jsonb) AS metrics
     FROM monitor_samples
     WHERE server_id = ANY($1) AND collected_at >= now() - ($2 || ' hours')::interval
     ORDER BY server_id, collected_at`,
    [serverIds, String(hours)],
  )
  const grouped = new Map<string, Array<{ at: number, metrics: MonitorMetrics }>>()
  for (const row of res.rows) {
    const list = grouped.get(row.server_id) || []
    list.push({ at: new Date(row.collected_at).getTime(), metrics: row.metrics || {} })
    grouped.set(row.server_id, list)
  }
  for (const id of serverIds) {
    const rows = grouped.get(id) || []
    out.set(id, downsampleLatency(rows, points))
  }
  return out
}

function downsampleLatency(rows: Array<{ at: number, metrics: MonitorMetrics }>, points: number): LatencyWindow {
  if (rows.length === 0) return { ping: [], loss: [] }
  const ping: Array<Record<string, unknown>> = []
  const loss: Array<Record<string, unknown>> = []
  const step = Math.max(1, Math.ceil(rows.length / points))
  for (let i = 0; i < rows.length; i += step) {
    const row = rows[i]
    ping.push({
      ts: row.at,
      ct: probeNum(row.metrics, "ping_ct"),
      cu: probeNum(row.metrics, "ping_cu"),
      cm: probeNum(row.metrics, "ping_cm"),
      bd: probeNum(row.metrics, "ping_bd"),
    })
    loss.push({
      ts: row.at,
      ct: probeNum(row.metrics, "loss_ct"),
      cu: probeNum(row.metrics, "loss_cu"),
      cm: probeNum(row.metrics, "loss_cm"),
      bd: probeNum(row.metrics, "loss_bd"),
    })
  }
  return { ping, loss }
}

function probeNum(metrics: MonitorMetrics, key: string) {
  const raw = metrics[key]
  if (raw === false || raw === "false" || raw == null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function flattenHistoryMetrics(at: Date, metrics: MonitorMetrics) {
  const timestamp = new Date(at).toISOString()
  const out: Record<string, unknown> = { timestamp }
  for (const [key, value] of Object.entries(metrics)) {
    if (key === "id" || key === "secret") continue
    out[key] = value
  }
  if (!out.load_avg && (metrics.load1 != null || metrics.load5 != null)) {
    out.load_avg = `${metrics.load1 || 0} ${metrics.load5 || 0} ${metrics.load15 || 0}`
  }
  return out
}

export async function getMonitorSettings(): Promise<Record<string, unknown>> {
  await ensureMonitorTables()
  const res = await (await db()).query<{ value: Record<string, unknown> }>(
    `SELECT value FROM monitor_settings WHERE key = 'site'`,
  )
  return (res.rows[0]?.value || {}) as Record<string, unknown>
}

export async function saveMonitorSettings(value: Record<string, unknown>) {
  await ensureMonitorTables()
  const current = await getMonitorSettings()
  const next = { ...current, ...value }
  await (await db()).query(
    `INSERT INTO monitor_settings (key, value) VALUES ('site', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(next)],
  )
  return next
}

export async function updateMonitorServerMeta(id: string, patch: {
  name?: string
  hidden?: boolean
  position?: number
  meta?: Record<string, unknown>
}) {
  await ensureMonitorTables()
  const row = await getMonitorServerAdmin(id)
  if (!row) throw new Error("找不到服务器")
  const meta = { ...(row.meta || {}), ...(patch.meta || {}) }
  await (await db()).query(
    `UPDATE monitor_servers
     SET name = COALESCE($2, name),
         hidden = COALESCE($3, hidden),
         position = COALESCE($4, position),
         meta = $5::jsonb,
         updated_at = now()
     WHERE id = $1`,
    [id, patch.name ?? null, patch.hidden ?? null, patch.position ?? null, JSON.stringify(meta)],
  )
}

export async function saveMonitorServerOrder(orders: Array<{ id: string, sort_order?: number, position?: number }>) {
  await ensureMonitorTables()
  const pool = await db()
  for (const item of orders) {
    const position = Number(item.sort_order ?? item.position)
    if (!item.id || !Number.isFinite(position)) continue
    await pool.query(`UPDATE monitor_servers SET position = $2, updated_at = now() WHERE id = $1`, [item.id, position])
  }
}

