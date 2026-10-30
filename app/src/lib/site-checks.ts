import { db } from "./db"
import { checkExpiry, checkHttp, siteCheckUrl, type ExpirySnapshot, type HttpCheck } from "./site-check-probe"
import { expiryRefreshDue, mergeExpiry } from "./site-check-cache"

let schema: Promise<void> | null = null
export async function siteCheckDb() {
  const pool = await db()
  if (!schema) schema = (async () => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      // SSR and the background worker can initialize in different modules/processes.
      await client.query("SELECT pg_advisory_xact_lock(716204, 1)")
      await client.query(`
    CREATE TABLE IF NOT EXISTS site_check_settings (
      site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      path text NOT NULL DEFAULT '/',
      version integer NOT NULL DEFAULT 1,
      next_check_at timestamptz NOT NULL DEFAULT now(),
      last_started_at timestamptz,
      expiry jsonb,
      expiry_host text
    );
    CREATE TABLE IF NOT EXISTS site_check_results (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      target_url text NOT NULL,
      checked_at timestamptz NOT NULL,
      ok boolean NOT NULL,
      status integer,
      duration_ms integer,
      error text
    );
    CREATE INDEX IF NOT EXISTS site_check_results_site_time ON site_check_results (site_id, checked_at DESC);
      `)
      await client.query("COMMIT")
    } catch (error) {await client.query("ROLLBACK"); throw error}
    finally {client.release()}
  })().catch(error => {schema = null; throw error})
  await schema
  return pool
}

type Settings = {site_id: number; enabled: boolean; path: string; version: number; expiry: ExpirySnapshot | null; expiry_host: string | null}
export type SiteCheckReport = {
  enabled: boolean; path: string; url: string; expiry: ExpirySnapshot | null; latest: HttpCheck | null;
  checks: HttpCheck[]; now: string;
}

export async function siteCheckReport(site: {id: number; domain: string}): Promise<SiteCheckReport> {
  const pool = await siteCheckDb()
  const [settings] = (await pool.query<Settings>("SELECT * FROM site_check_settings WHERE site_id=$1", [site.id])).rows
  const path = settings?.path || "/"
  const url = siteCheckUrl(site.domain, path).href
  const rows = await pool.query<{checked_at: Date; ok: boolean; status: number | null; duration_ms: number | null; error: string | null}>(`
    SELECT checked_at,ok,status,duration_ms,error FROM site_check_results
    WHERE site_id=$1 AND target_url=$2 AND checked_at > now() - interval '24 hours'
    ORDER BY checked_at DESC LIMIT 1440`, [site.id, url])
  const checks = rows.rows.reverse().map(row => ({checkedAt: row.checked_at.toISOString(), ok: row.ok, status: row.status, durationMs: row.duration_ms, error: row.error}))
  return {enabled: settings?.enabled || false, path, url, expiry: settings?.expiry_host === site.domain ? settings.expiry : null,
    latest: checks.at(-1) || null, checks, now: new Date().toISOString()}
}

export async function siteCertificateExpiries(siteIds: number[]) {
  const expiries = new Map<number, string | null>()
  if (!siteIds.length) return expiries
  const pool = await siteCheckDb()
  const rows = await pool.query<{site_id: number; expires_at: string | null}>(`
    SELECT c.site_id,c.expiry->'certificate'->>'expiresAt' AS expires_at
    FROM site_check_settings c JOIN sites s ON s.id=c.site_id
    WHERE c.site_id=ANY($1) AND c.expiry_host=s.domain`, [siteIds])
  for (const row of rows.rows) expiries.set(Number(row.site_id), row.expires_at)
  return expiries
}

export async function saveSiteCheck(site: {id: number; domain: string}, enabled: boolean, path: string) {
  siteCheckUrl(site.domain, path)
  const pool = await siteCheckDb()
  await pool.query(`INSERT INTO site_check_settings(site_id,enabled,path) VALUES($1,$2,$3)
    ON CONFLICT(site_id) DO UPDATE SET enabled=excluded.enabled,path=excluded.path,
      version=site_check_settings.version+1,next_check_at=now()`, [site.id, enabled, path])
}

/** Atomic claim serializes scheduled/manual work across app processes. */
export async function runSiteCheck(siteId: number, manual = false, probes = {http: checkHttp, expiry: checkExpiry}) {
  const pool = await siteCheckDb()
  const [job] = (await pool.query<Settings & {domain: string}>(`
    UPDATE site_check_settings c SET last_started_at=now(),next_check_at=now()+interval '5 minutes'
    FROM sites s WHERE c.site_id=$1 AND s.id=c.site_id AND c.enabled
      AND (c.last_started_at IS NULL OR c.last_started_at < now()-interval '1 minute')
      AND ($2 OR c.next_check_at <= now())
    RETURNING c.*,s.domain`, [siteId, manual])).rows
  if (!job) return false
  const url = siteCheckUrl(job.domain, job.path)
  const previousExpiry = job.expiry_host === job.domain ? job.expiry : null
  const expiryDue = manual || expiryRefreshDue(previousExpiry)
  const [http, expiry] = await Promise.all([probes.http(url), expiryDue ? probes.expiry(url.hostname) : null])
  // Pausing/changing settings or renaming a site while a request runs invalidates its result.
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const valid = await client.query(`SELECT c.site_id FROM site_check_settings c JOIN sites s ON s.id=c.site_id
      WHERE c.site_id=$1 AND c.version=$2 AND c.enabled AND s.domain=$3 FOR UPDATE OF c,s`, [siteId, job.version, job.domain])
    if (valid.rows.length) {
      await client.query(`INSERT INTO site_check_results(site_id,target_url,checked_at,ok,status,duration_ms,error) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [siteId, url.href, http.checkedAt, http.ok, http.status, http.durationMs, http.error])
      if (expiry) await client.query("UPDATE site_check_settings SET expiry=$2,expiry_host=$3 WHERE site_id=$1", [siteId, JSON.stringify(mergeExpiry(previousExpiry, expiry)), job.domain])
    }
    await client.query("COMMIT")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release() }
  return true
}

export async function runDueSiteChecks() {
  const pool = await siteCheckDb()
  const jobs = await pool.query<{site_id: number}>("SELECT site_id FROM site_check_settings WHERE enabled AND next_check_at <= now() ORDER BY next_check_at LIMIT 20")
  // Two bounded workers; claims protect other app processes and manual requests.
  let cursor = 0
  await Promise.all(Array.from({length: 2}, async () => {
    while (cursor < jobs.rows.length) {
      const job = jobs.rows[cursor++]
      try { await runSiteCheck(job.site_id) }
      catch { console.error("[Plost] Site check job failed", {siteId: job.site_id}) }
    }
  }))
}
