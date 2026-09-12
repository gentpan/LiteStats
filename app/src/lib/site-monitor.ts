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

const KEEP_DAYS = 7
let started = false

export function buildMonitorUrl(domain: string, monitorUrl?: string | null) {
  const trimmed = monitorUrl?.trim()
  if (trimmed) return trimmed.includes("://") ? trimmed : `https://${trimmed}`
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")
  return host ? `https://${host}` : ""
}

export function getSslHealth(daysLeft?: number | null, valid?: boolean | null): SslHealth {
  if (valid == null) return "none"
  if (!valid || daysLeft == null) return "invalid"
  if (daysLeft <= 7) return "critical"
  if (daysLeft <= 30) return "warning"
  return "ok"
}

export async function ensureSiteMonitorTables() {
  const pool = await db()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_monitors (
      site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT true,
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
  const sites = await pool.query<{ id: number, domain: string, enabled: boolean, url: string | null }>(`
    SELECT s.id, s.domain, COALESCE(m.enabled, true) AS enabled, m.url
    FROM sites s
    LEFT JOIN site_monitors m ON m.site_id = s.id
    WHERE COALESCE(s.consolidated, false) = false
    ORDER BY s.id
  `)
  const due = sites.rows.filter((row) => row.enabled)
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
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "LiteStats-Monitor/1.0", Accept: "*/*" },
    })
    const up = response.status >= 200 && response.status < 400
    return {
      status: (up ? "up" : "down") as MonitorStatus,
      responseMs: Date.now() - start,
      statusCode: response.status,
      error: up ? null : `HTTP ${response.status}`,
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

function checkSsl(hostname: string, port = 443) {
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
      { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 12_000 },
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
          valid: expiresAt.getTime() > Date.now(),
          expiresAt,
          daysLeft: Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000),
          issuer: Array.isArray(issuerRaw) ? issuerRaw[0] : issuerRaw || null,
          error: null,
        })
      },
    )
    socket.on("error", (error) => {
      resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: error.message })
    })
    socket.on("timeout", () => {
      socket.destroy()
      resolve({ valid: false, expiresAt: null, daysLeft: null, issuer: null, error: "SSL connection timeout" })
    })
  })
}

export async function runCheck(siteId: number, domain: string, monitorUrl?: string | null) {
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
      ? checkSsl(hostname)
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
    SELECT s.id AS site_id, COALESCE(m.enabled, true) AS enabled, m.url, s.domain
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
    const check = bySite.get(Number(row.site_id))
    map.set(Number(row.site_id), {
      enabled: row.enabled,
      url: buildMonitorUrl(row.domain, row.url),
      status: check?.status || null,
      response_ms: check?.response_ms ?? null,
      status_code: check?.status_code ?? null,
      ssl_valid: check?.ssl_valid ?? null,
      ssl_expires_at: check?.ssl_expires_at ? new Date(check.ssl_expires_at).toISOString() : null,
      ssl_days_left: check?.ssl_days_left ?? null,
      ssl_issuer: check?.ssl_issuer ?? null,
      ssl_health: getSslHealth(check?.ssl_days_left, check?.ssl_valid),
      error: check?.error ?? null,
      checked_at: check?.checked_at ? new Date(check.checked_at).toISOString() : null,
    })
  }
  return map
}

export async function getSiteMonitor(siteId: number, domain: string) {
  startSiteMonitor()
  await ensureSiteMonitorTables()
  const latest = (await latestSiteChecks([siteId])).get(siteId) || {
    enabled: true,
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
  const pool = await db()
  const settings = await pool.query<{ enabled: boolean, url: string | null }>(
    `SELECT enabled, url FROM site_monitors WHERE site_id = $1`,
    [siteId],
  )
  const history = await pool.query<SiteMonitorCheck>(
    `SELECT id, status, response_ms, status_code, ssl_valid, ssl_days_left, ssl_issuer, error, checked_at::text
     FROM site_monitor_checks WHERE site_id = $1
     ORDER BY checked_at DESC LIMIT 48`,
    [siteId],
  )
  return {
    enabled: settings.rows[0]?.enabled ?? true,
    url: settings.rows[0]?.url || "",
    latest,
    history: history.rows,
  }
}

export async function saveSiteMonitor(siteId: number, patch: { enabled: boolean, url?: string }) {
  await ensureSiteMonitorTables()
  const url = patch.url?.trim() || null
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
