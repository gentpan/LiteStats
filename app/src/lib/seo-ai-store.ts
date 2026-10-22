import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type pg from "pg"
import { db } from "./db"
import { SESSION_KEY } from "./env"
import { publicUrl } from "./site-check-network"
import { requestSeoAi } from "./seo-ai-transport"
import { SeoAiError, keywordSeoDataSchema, parseSeoAiResponse, seoAiConfigSchema, seoAiExpectedConfigSchema, seoAiStoredReportSchema, type KeywordSeoData, type SeoAiConfig, type SeoAiGeneration, type SeoAiHistoryResult, type SeoAiPublicConfig, type SeoAiReport, type SeoAiResult } from "./seo-ai"

type StoredReport = {model: string; data: KeywordSeoData; result: SeoAiResult}
type StoreOptions = {database?: () => Promise<pg.Pool>; secret?: () => string; request?: typeof requestSeoAi}
const defaults: SeoAiConfig = {endpoint: "https://api.openai.com/v1/chat/completions", model: "", apiKey: "", tokenParameter: "max_completion_tokens"}
const publicConfig = ({apiKey, ...config}: SeoAiConfig): SeoAiPublicConfig => ({...config, hasKey: !!apiKey})
const lockName = (siteId: number) => `litestats:seo-ai:${siteId}`

/** Injectable database/network boundaries allow tests to run without credentials or databases. */
export function createSeoAiStore(options: StoreOptions = {}) {
  const database = options.database || db
  const send = options.request || requestSeoAi
  // Keep long model requests from occupying the core application's entire PG pool.
  // The production singleton shares this limit across all sites in this process.
  let activeGenerations = 0
  const key = () => createHash("sha256").update(`litestats-seo-ai-v1:${(options.secret || (() => SESSION_KEY))()}`).digest()
  const aad = (siteId: number, kind: string) => Buffer.from(`litestats-seo-ai:${kind}:${siteId}`)
  function encrypt(siteId: number, kind: string, value: unknown) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv)
    cipher.setAAD(aad(siteId, kind))
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
    return [iv, cipher.getAuthTag(), data].map(part => part.toString("base64")).join(":")
  }
  function decrypt<T>(siteId: number, kind: string, value: string): T {
    try {
      const parts = value.split(":").map(part => Buffer.from(part, "base64"))
      if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error()
      const cipher = createDecipheriv("aes-256-gcm", key(), parts[0])
      cipher.setAAD(aad(siteId, kind)); cipher.setAuthTag(parts[1])
      return JSON.parse(Buffer.concat([cipher.update(parts[2]), cipher.final()]).toString("utf8"))
    } catch { throw new SeoAiError("config_error") }
  }
  let ready: Promise<pg.Pool> | null = null
  async function table() {
    if (!ready) ready = (async () => {
      const pool = await database()
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        // IF NOT EXISTS alone can still race on PostgreSQL catalog entries in different workers.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["litestats:seo-ai:schema"])
        await client.query(`CREATE TABLE IF NOT EXISTS site_seo_ai_config (
          site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
          encrypted text NOT NULL, last_requested_at timestamptz,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query(`CREATE TABLE IF NOT EXISTS site_seo_ai_reports (
          id bigserial PRIMARY KEY, site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
          encrypted text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query("CREATE INDEX IF NOT EXISTS site_seo_ai_reports_site_created_idx ON site_seo_ai_reports(site_id, created_at DESC)")
        await client.query("COMMIT")
      } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error }
      finally { client.release() }
      return pool
    })().catch(error => { ready = null; throw error })
    return ready
  }
  function safeError(error: unknown) { return error instanceof SeoAiError ? error : new SeoAiError("storage_error") }
  function report(siteId: number, row: {id: number; encrypted: string; created_at: Date | string}): SeoAiReport {
    const stored = seoAiStoredReportSchema.parse(decrypt(siteId, "report", row.encrypted))
    return {id: Number(row.id), createdAt: new Date(row.created_at).toISOString(), model: stored.model,
      provider: stored.data.provider, from: stored.data.from, to: stored.data.to, scopeLabel: stored.data.scopeLabel, ...stored.result}
  }
  async function getConfig(siteId: number): Promise<SeoAiPublicConfig> {
    try {
      const result = await (await table()).query<{encrypted: string}>("SELECT encrypted FROM site_seo_ai_config WHERE site_id=$1", [siteId])
      return publicConfig(result.rows[0] ? seoAiConfigSchema.parse(decrypt(siteId, "config", result.rows[0].encrypted)) : defaults)
    } catch (error) { throw safeError(error) }
  }
  async function saveConfig(siteId: number, input: SeoAiConfig): Promise<SeoAiPublicConfig> {
    const parsed = seoAiConfigSchema.safeParse(input)
    if (!parsed.success) throw new SeoAiError("endpoint_invalid")
    try { publicUrl(parsed.data.endpoint) } catch { throw new SeoAiError("endpoint_invalid") }
    let client: pg.PoolClient | undefined
    try {
      client = await (await table()).connect()
      await client.query("BEGIN")
      const lock = await client.query<{locked: boolean}>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [lockName(siteId)])
      if (!lock.rows[0]?.locked) throw new SeoAiError("busy")
      const previous = await client.query<{encrypted: string}>("SELECT encrypted FROM site_seo_ai_config WHERE site_id=$1 FOR UPDATE", [siteId])
      const config = parsed.data
      if (!config.apiKey) {
        const old = previous.rows[0] ? decrypt<SeoAiConfig>(siteId, "config", previous.rows[0].encrypted) : null
        if (!old?.apiKey) throw new SeoAiError("not_configured")
        if (config.endpoint !== old.endpoint) throw new SeoAiError("key_required")
        config.apiKey = old.apiKey
      }
      await client.query(`INSERT INTO site_seo_ai_config(site_id,encrypted) VALUES($1,$2)
        ON CONFLICT(site_id) DO UPDATE SET encrypted=EXCLUDED.encrypted,updated_at=now()`, [siteId, encrypt(siteId, "config", config)])
      await client.query("COMMIT")
      return publicConfig(config)
    } catch (error) { if (client) await client.query("ROLLBACK").catch(() => {}); throw safeError(error) }
    finally { client?.release() }
  }
  async function history(siteId: number): Promise<SeoAiHistoryResult> {
    try {
      const result = await (await table()).query<{id: number; encrypted: string; created_at: Date | string}>("SELECT id,encrypted,created_at FROM site_seo_ai_reports WHERE site_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10", [siteId])
      const reports: SeoAiReport[] = []
      let unreadableCount = 0
      for (const row of result.rows) {
        try { reports.push(report(siteId, row)) }
        catch { unreadableCount++ }
      }
      return {reports, unreadableCount}
    } catch (error) { throw safeError(error) }
  }
  async function removeConfig(siteId: number): Promise<{ok: true}> {
    let client: pg.PoolClient | undefined
    try {
      client = await (await table()).connect()
      await client.query("BEGIN")
      const lock = await client.query<{locked: boolean}>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [lockName(siteId)])
      if (!lock.rows[0]?.locked) throw new SeoAiError("busy")
      await client.query("DELETE FROM site_seo_ai_config WHERE site_id=$1", [siteId])
      await client.query("COMMIT")
      return {ok: true}
    } catch (error) { if (client) await client.query("ROLLBACK").catch(() => {}); throw safeError(error) }
    finally { client?.release() }
  }
  /** Internal only: caller must authenticate an administrator and load the snapshot server-side. */
  async function generate(siteId: number, domain: string, input: KeywordSeoData, expectedConfig?: Pick<SeoAiPublicConfig, "endpoint" | "model" | "tokenParameter">): Promise<SeoAiGeneration> {
    const parsed = keywordSeoDataSchema.safeParse(input)
    if (!parsed.success || !parsed.data.rows.length) return {ok: false, error: "no_data", message: new SeoAiError("no_data").message}
    if (activeGenerations >= 2) return {ok: false, error: "service_busy", message: new SeoAiError("service_busy").message}
    activeGenerations++
    const data = {...parsed.data, rows: parsed.data.rows.slice(0, 50)}
    let client: pg.PoolClient | undefined
    try {
      client = await (await table()).connect()
      await client.query("BEGIN")
      const lock = await client.query<{locked: boolean}>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [lockName(siteId)])
      if (!lock.rows[0]?.locked) throw new SeoAiError("busy")
      const configRows = await client.query<{encrypted: string; retry_after: number}>(`SELECT encrypted,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (last_requested_at + INTERVAL '60 seconds' - clock_timestamp()))))::int AS retry_after
        FROM site_seo_ai_config WHERE site_id=$1 FOR UPDATE`, [siteId])
      if (!configRows.rows[0]) throw new SeoAiError("not_configured")
      const config = seoAiConfigSchema.parse(decrypt(siteId, "config", configRows.rows[0].encrypted))
      if (!config.apiKey) throw new SeoAiError("not_configured")
      if (expectedConfig) {
        const expected = seoAiExpectedConfigSchema.safeParse(expectedConfig)
        if (!expected.success || (["endpoint", "model", "tokenParameter"] as const).some(key => expected.data[key] !== config[key])) throw new SeoAiError("config_changed")
      }
      if (configRows.rows[0].retry_after > 0) throw new SeoAiError("cooldown", configRows.rows[0].retry_after)
      await client.query("UPDATE site_seo_ai_config SET last_requested_at=clock_timestamp() WHERE site_id=$1", [siteId])
      let result: SeoAiResult
      try {
        result = parseSeoAiResponse(await send(config, domain, data), data)
        const text = [result.summary, ...result.suggestions.flatMap(item => [item.keyword, item.reason, item.action])]
        if (text.some(value => value.includes(config.apiKey))) throw new SeoAiError("invalid_response")
      }
      catch (error) {
        // Preserve cooldown after upstream failure while releasing the transaction lock.
        await client.query("COMMIT")
        const failure = error instanceof SeoAiError ? error : new SeoAiError("request_failed")
        return {ok: false, error: failure.code, message: failure.message, ...(failure.retryAfter ? {retryAfter: failure.retryAfter} : {})}
      }
      const rows = await client.query<{id: number; encrypted: string; created_at: Date | string}>(
        "INSERT INTO site_seo_ai_reports(site_id,encrypted) VALUES($1,$2) RETURNING id,encrypted,created_at",
        [siteId, encrypt(siteId, "report", {model: config.model, data, result} satisfies StoredReport)],
      )
      await client.query("COMMIT")
      return {ok: true, report: report(siteId, rows.rows[0])}
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {})
      const failure = safeError(error)
      return {ok: false, error: failure.code, message: failure.message, ...(failure.retryAfter ? {retryAfter: failure.retryAfter} : {})}
    } finally { activeGenerations--; client?.release() }
  }
  return {getConfig, saveConfig, removeConfig, history, generate}
}

const store = createSeoAiStore()
export const seoAiPublicConfig = store.getConfig
export const saveSeoAiConfig = store.saveConfig
export const removeSeoAiConfig = store.removeConfig
export const seoAiHistory = store.history
export const generateSeoForSite = store.generate
