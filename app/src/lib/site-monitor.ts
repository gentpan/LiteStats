import { publicStatus, resolvePublicTarget } from "./safe-http"
import tls from "node:tls"
import { db } from "./db"

export type MonitorStatus = "up" | "down"
export type SslHealth = "ok" | "warning" | "critical" | "invalid" | "none"

export type SiteMonitorLatest = {
  enabled: boolean
  url: string
  status: MonitorStatus | null
  response_ms: number | null
  status_code: number | null
  ssl_valid: boolean | null
  ssl_expires_at: string | null
  ssl_days_left: number | null
  ssl_issuer: string | null
  ssl_health: SslHealth
  error: string | null
  checked_at: string | null
}

export type SiteMonitorCheck = {
  id: number
  status: MonitorStatus
  response_ms: number | null
  status_code: number | null
  ssl_valid: boolean | null
  ssl_days_left: number | null
  ssl_issuer: string | null
  error: string | null
  checked_at: string
}

const KEEP_DAYS = 30
let started = false

function buildMonitorUrl(domain: string, monitorUrl?: string | null) {
  const trimmed = monitorUrl?.trim()
  if (trimmed) return trimmed.includes("://") ? trimmed : `https://${trimmed}`
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")
  return host ? `https://${host}` : ""
}

function getSslHealth(daysLeft?: number | null, valid?: boolean | null): SslHealth {
  if (valid == null) return "none"
  if (!valid || daysLeft == null) return "invalid"
  if (daysLeft <= 7) return "critical"
  if (daysLeft <= 30) return "warning"
  return "ok"
}

async function ensureSiteMonitorTables() {
  const pool = await db()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_monitors (
      site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      url text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_monitor_checks (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      status varchar(16) NOT NULL,
      response_ms int,
      status_code int,
      ssl_valid boolean,
      ssl_expires_at timestamptz,
      ssl_days_left int,
      ssl_issuer text,
      error text,
      checked_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS site_monitor_checks_site_checked ON site_monitor_checks (site_id, checked_at DESC)`)
}

export function startSiteMonitor() {
  if (started) return
  started = true
  void tickAll().catch(() => {})
  setInterval(() => {
    void tickAll().catch(() => {})
  }, 60_000)
}

async function tickAll() {
  await ensureSiteMonitorTables()
  const pool = await db()
  await pool.query(`DELETE FROM event_sessions WHERE last_seen_at < now() - interval '2 days'`)
  const sites = await pool.query<{ id: number, domain: string, url: string | null }>(`
    SELECT s.id, s.domain, m.url
    FROM sites s
    INNER JOIN site_monitors m ON m.site_id = s.id
    WHERE m.enabled = true AND COALESCE(s.consolidated, false) = false
    ORDER BY s.id
  `)
  const due = sites.rows
  let i = 0
  async function worker() {
    while (i < due.length) {
      const row = due[i++]
      await runCheck(row.id, row.domain, row.url).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, due.length || 1) }, worker))
  await pool.query(`DELETE FROM site_monitor_checks WHERE checked_at < now() - ($1 || ' days')::interval`, [String(KEEP_DAYS)])
}

async function checkUptime(url: string) {
  const start = Date.now()
  try {
    const statusCode = await publicStatus(url)
    const up = statusCode >= 200 && statusCode < 400
    return {
      status: (up ? "up" : "down") as MonitorStatus,
      responseMs: Date.now() - start,
      statusCode,
      error: up ? null : `HTTP ${statusCode}`,
    }
  } catch (error) {
    return {
      status: "down" as MonitorStatus,
      responseMs: Date.now() - start,
      statusCode: null as number | null,
      error: error instanceof Error ? error.message : "Request failed",
    }
  }
}

async function checkSsl(hostname: string, port = 443) {
  let address: string
  try { address = (await resolvePublicTarget(`https://${hostname}:${port}`)).address }
  catch (error) { return { valid: false, expiresAt: null, daysLeft: null, issuer: null, error: error instanceof Error ? error.message : "Invalid target" } }
  return new Promise<{
    valid: boolean
    expiresAt: Date | null
    daysLeft: number | null
    issuer: string | null
    error: string | null
  }>((resolve) => {
    if (!hostname) {
      resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: "Invalid hostname" })
      return
    }
    const socket = tls.connect(
      { host: address, port, servername: hostname, rejectUnauthorized: false, timeout: 12_000 },
      () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        if (!cert || !cert.valid_to) {
          resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: "No certificate found" })
          return
        }
        const expiresAt = new Date(cert.valid_to)
        const issuerRaw = cert.issuer?.O ?? cert.issuer?.CN
        resolve({
          valid: socket.authorized && expiresAt.getTime() > Date.now(),
          expiresAt,
          daysLeft: Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000),
          issuer: Array.isArray(issuerRaw) ? issuerRaw[0] : issuerRaw || null,
          error: socket.authorized ? null : String(socket.authorizationError || "证书无效"),
        })
      },
    )
    socket.on("error", (error: Error) => {
      resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: error.message })
    })
    socket.on("timeout", () => {
      socket.destroy()
      resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: "SSL connection timeout" })
    })
  })
}

async function runCheck(siteId: number, domain: string, monitorUrl?: string | null) {
  await ensureSiteMonitorTables()
  const url = buildMonitorUrl(domain, monitorUrl)
  if (!url) return
  let hostname = ""
  let https = false
  try {
    const parsed = new URL(url)
    hostname = parsed.hostname
    https = parsed.protocol === "https:"
  } catch {
    hostname = domain
  }
  const [uptime, ssl] = await Promise.all([
    checkUptime(url),
    https
      ? checkSsl(hostname, Number(new URL(url).port) || 443)
      : Promise.resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: "HTTP only (no SSL)" }),
  ])
  const pool = await db()
  await pool.query(
    `INSERT INTO site_monitor_checks
      (site_id, status, response_ms, status_code, ssl_valid, ssl_expires_at, ssl_days_left, ssl_issuer, error, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [
      siteId,
      uptime.status,
      uptime.responseMs,
      uptime.statusCode,
      ssl.valid,
      ssl.expiresAt,
      ssl.daysLeft,
      ssl.issuer,
      uptime.error || ssl.error,
    ],
  )
}

export async function latestSiteChecks(siteIds: number[]) {
  const map = new Map<number, SiteMonitorLatest>()
  if (!siteIds.length) return map
  await ensureSiteMonitorTables()
  const pool = await db()
  const settings = await pool.query<{ site_id: number, enabled: boolean, url: string | null, domain: string }>(`
    SELECT s.id AS site_id, COALESCE(m.enabled, false) AS enabled, m.url, s.domain
    FROM sites s
    LEFT JOIN site_monitors m ON m.site_id = s.id
    WHERE s.id = ANY($1::bigint[])
  `, [siteIds])
  const checks = await pool.query<{
    site_id: number
    status: MonitorStatus
    response_ms: number | null
    status_code: number | null
    ssl_valid: boolean | null
    ssl_expires_at: Date | null
    ssl_days_left: number | null
    ssl_issuer: string | null
    error: string | null
    checked_at: Date
  }>(`
    SELECT DISTINCT ON (site_id)
      site_id, status, response_ms, status_code, ssl_valid, ssl_expires_at, ssl_days_left, ssl_issuer, error, checked_at
    FROM site_monitor_checks
    WHERE site_id = ANY($1::bigint[])
    ORDER BY site_id, checked_at DESC
  `, [siteIds])
  const bySite = new Map(checks.rows.map((row) => [Number(row.site_id), row]))
  for (const row of settings.rows) {
    const isEnabled = Boolean(row.enabled)
    const check = isEnabled ? bySite.get(Number(row.site_id)) : undefined
    map.set(Number(row.site_id), {
      enabled: isEnabled,
      url: buildMonitorUrl(row.domain, row.url),
      status: isEnabled ? (check?.status || null) : null,
      response_ms: isEnabled ? (check?.response_ms ?? null) : null,
      status_code: isEnabled ? (check?.status_code ?? null) : null,
      ssl_valid: isEnabled ? (check?.ssl_valid ?? null) : null,
      ssl_expires_at: isEnabled && check?.ssl_expires_at ? new Date(check.ssl_expires_at).toISOString() : null,
      ssl_days_left: isEnabled ? (check?.ssl_days_left ?? null) : null,
      ssl_issuer: isEnabled ? (check?.ssl_issuer ?? null) : null,
      ssl_health: isEnabled ? getSslHealth(check?.ssl_days_left, check?.ssl_valid) : "none",
      error: isEnabled ? (check?.error ?? null) : null,
      checked_at: isEnabled && check?.checked_at ? new Date(check.checked_at).toISOString() : null,
    })
  }
  return map
}

export async function getSiteMonitor(siteId: number, domain: string) {
  startSiteMonitor()
  await ensureSiteMonitorTables()
  const pool = await db()
  const settings = await pool.query<{ enabled: boolean, url: string | null }>(
    `SELECT enabled, url FROM site_monitors WHERE site_id = $1`,
    [siteId],
  )
  const isEnabled = settings.rows[0]?.enabled ?? false
  const latest = (await latestSiteChecks([siteId])).get(siteId) || {
    enabled: isEnabled,
    url: buildMonitorUrl(domain),
    status: null,
    response_ms: null,
    status_code: null,
    ssl_valid: null,
    ssl_expires_at: null,
    ssl_days_left: null,
    ssl_issuer: null,
    ssl_health: "none" as SslHealth,
    error: null,
    checked_at: null,
  }
  const history = await getSiteMonitorHistory(siteId)
  return {
    enabled: isEnabled,
    url: settings.rows[0]?.url || "",
    latest,
    history,
  }
}

/** A fixed upper bound keeps new checks from shifting rows between pages. */
export async function getSiteMonitorHistory(siteId: number, days: 7 | 30 = 7, requestedPage = 1, asOf = new Date().toISOString()) {
  await ensureSiteMonitorTables()
  const pool = await db()
  const params = [siteId, asOf, days]
  const filter = `site_id = $1 AND checked_at <= $2::timestamptz AND checked_at > $2::timestamptz - ($3::int * interval '1 day')`
  const count = await pool.query<{total: string}>(`SELECT count(*) AS total FROM site_monitor_checks WHERE ${filter}`, params)
  const total = Number(count.rows[0].total)
  const pages = Math.max(1, Math.ceil(total / 10))
  const page = Math.min(Math.max(1, requestedPage), pages)
  const result = await pool.query<SiteMonitorCheck>(
    `SELECT id, status, response_ms, status_code, ssl_valid, ssl_days_left, ssl_issuer, error, checked_at::text
     FROM site_monitor_checks WHERE ${filter}
     ORDER BY checked_at DESC, id DESC LIMIT 10 OFFSET $4`,
    [...params, (page - 1) * 10],
  )
  return { rows: result.rows, total, page, pages, days, asOf }
}

export async function saveSiteMonitor(siteId: number, patch: { enabled: boolean, url?: string }) {
  await ensureSiteMonitorTables()
  const url = patch.url?.trim() || null
  if (url) await resolvePublicTarget(buildMonitorUrl("", url))
  const pool = await db()
  await pool.query(
    `INSERT INTO site_monitors (site_id, enabled, url, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (site_id) DO UPDATE SET enabled = EXCLUDED.enabled, url = EXCLUDED.url, updated_at = now()`,
    [siteId, patch.enabled, url],
  )
}

export async function runSiteCheckNow(siteId: number, domain: string) {
  await ensureSiteMonitorTables()
  const pool = await db()
  const settings = await pool.query<{ enabled: boolean, url: string | null }>(
    `SELECT enabled, url FROM site_monitors WHERE site_id = $1`,
    [siteId],
  )
  await runCheck(siteId, domain, settings.rows[0]?.url)
  return getSiteMonitor(siteId, domain)
}
