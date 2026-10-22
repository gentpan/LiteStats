import { expect, test } from "bun:test"
import type pg from "pg"
import { createSeoAiStore } from "../src/lib/seo-ai-store"
import { SeoAiError, type KeywordSeoData, type SeoAiConfig } from "../src/lib/seo-ai"

const config: SeoAiConfig = {endpoint: "https://api.example.com/v1/chat/completions", model: "test-model", apiKey: "fixture-private-key", tokenParameter: "max_tokens"}
const data: KeywordSeoData = {provider: "google", from: "2026-10-01", to: "2026-10-21", scopeLabel: "Google 汇总", rows: [{query: "网站统计", clicks: 2, impressions: 20, ctr: .1, position: 4}]}
const modelOutput = {summary: "仅依据汇总数据。", suggestions: [{keyword: "网站统计", reason: "已有点击。", action: "核对相关页面与搜索意图。", priority: "medium"}]}
const response = () => ({choices: [{message: {content: JSON.stringify(modelOutput)}, finish_reason: "stop"}]})

/** In-memory SQL boundary: no real pool, tables, credentials or network are used. */
function memoryDatabase() {
  const configs = new Map<number, {encrypted: string; retry_after: number}>()
  const reports: {id: number; site_id: number; encrypted: string; created_at: string}[] = []
  const locks = new Set<string>()
  const queries: string[] = []
  let released = 0
  async function query(sql: string, values: unknown[] = [], held = new Set<string>()) {
    queries.push(sql)
    const id = Number(values[0])
    if (/CREATE /.test(sql) || sql === "BEGIN") return {rows: []}
    if (sql.includes("pg_advisory_xact_lock")) return {rows: []}
    if (sql === "COMMIT" || sql === "ROLLBACK") {
      for (const lock of held) locks.delete(lock)
      held.clear()
      return {rows: []}
    }
    if (sql.includes("pg_try_advisory_xact_lock")) {
      const lock = String(values[0])
      if (locks.has(lock)) return {rows: [{locked: false}]}
      locks.add(lock); held.add(lock)
      return {rows: [{locked: true}]}
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM site_seo_ai_config")) return {rows: configs.has(id) ? [configs.get(id)] : []}
    if (sql.startsWith("INSERT INTO site_seo_ai_config")) {
      configs.set(id, {encrypted: String(values[1]), retry_after: configs.get(id)?.retry_after || 0})
      return {rows: []}
    }
    if (sql.startsWith("UPDATE site_seo_ai_config")) { configs.get(id)!.retry_after = 60; return {rows: []} }
    if (sql.startsWith("DELETE FROM site_seo_ai_config")) { configs.delete(id); return {rows: []} }
    if (sql.startsWith("INSERT INTO site_seo_ai_reports")) {
      const row = {id: reports.length + 1, site_id: id, encrypted: String(values[1]), created_at: "2026-10-22T12:00:00Z"}
      reports.push(row); return {rows: [row]}
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM site_seo_ai_reports")) return {rows: reports.filter(row => row.site_id === id).reverse().slice(0, 10)}
    throw new Error(`Unexpected mock query: ${sql}`)
  }
  const pool = {
    query,
    connect: async () => {
      const held = new Set<string>()
      return {query: (sql: string, values?: unknown[]) => query(sql, values, held), release: () => {released++}}
    },
  } as unknown as pg.Pool
  return {pool, configs, reports, locks, queries, released: () => released}
}

test("AI settings encrypt keys, retain blank keys only for the same endpoint and bind ciphertext to its site", async () => {
  const memory = memoryDatabase()
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key"})
  expect(await store.getConfig(1)).toMatchObject({hasKey: false})
  expect(await store.saveConfig(1, config)).toEqual({endpoint: config.endpoint, model: config.model, hasKey: true, tokenParameter: config.tokenParameter})
  expect(memory.configs.get(1)!.encrypted).not.toContain(config.apiKey)
  expect(memory.configs.get(1)!.encrypted).not.toContain(config.endpoint)
  expect(await store.saveConfig(1, {...config, apiKey: "", model: "other-model"})).toMatchObject({hasKey: true, model: "other-model"})
  await expect(store.saveConfig(1, {...config, apiKey: "", endpoint: "https://other.example.com/v1/chat/completions"})).rejects.toMatchObject({code: "key_required"})
  memory.configs.set(2, {...memory.configs.get(1)!})
  await expect(store.getConfig(2)).rejects.toMatchObject({code: "config_error"})
  expect(memory.locks.size).toBe(0)
})

test("generation stores encrypted bounded snapshots, provides site-scoped history and preserves it when key is removed", async () => {
  const memory = memoryDatabase()
  let calls = 0
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key", request: async (actualConfig, domain, snapshot) => {
    calls++
    expect(actualConfig.apiKey).toBe(config.apiKey)
    expect(domain).toBe("example.com")
    expect(snapshot.rows).toHaveLength(50)
    return response()
  }})
  await store.saveConfig(1, config)
  const generated = await store.generate(1, "example.com", {...data, rows: [data.rows[0], ...Array.from({length: 60}, (_, i) => ({...data.rows[0], query: `term-${i}`}))]})
  expect(generated).toMatchObject({ok: true, report: {...modelOutput, id: 1, model: "test-model", provider: "google"}})
  expect(memory.reports[0].encrypted).not.toContain("网站统计")
  expect(memory.reports[0].encrypted).not.toContain(config.apiKey)
  expect((await store.history(1)).reports).toHaveLength(1)
  expect((await store.history(2)).reports).toHaveLength(0)
  expect(await store.generate(1, "example.com", data)).toMatchObject({ok: false, error: "cooldown", retryAfter: 60})
  expect(calls).toBe(1)
  expect(await store.removeConfig(1)).toEqual({ok: true})
  expect(await store.getConfig(1)).toMatchObject({hasKey: false})
  expect((await store.history(1)).reports).toHaveLength(1)
})

test("failed generation preserves cooldown, stores no invented result and always releases locks", async () => {
  const memory = memoryDatabase()
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key", request: async () => {throw new SeoAiError("auth_error")}})
  expect(await store.generate(1, "example.com", {...data, rows: []})).toMatchObject({ok: false, error: "no_data"})
  expect(memory.queries).toHaveLength(0)
  expect(await store.generate(1, "example.com", data)).toMatchObject({ok: false, error: "not_configured"})
  await store.saveConfig(1, config)
  expect(await store.generate(1, "example.com", data)).toMatchObject({ok: false, error: "auth_error"})
  expect(memory.reports).toHaveLength(0)
  expect(memory.configs.get(1)?.retry_after).toBe(60)
  expect(memory.locks.size).toBe(0)
  expect(await store.generate(1, "example.com", data)).toMatchObject({ok: false, error: "cooldown"})
  expect(memory.released()).toBe(5)
})

test("overlapping requests and configuration changes share one per-site transaction lock", async () => {
  const memory = memoryDatabase()
  let release: (value: unknown) => void = () => {}
  let started: () => void = () => {}
  const ready = new Promise<void>(resolve => {started = resolve})
  let calls = 0
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key", request: async () => {
    calls++; started()
    return new Promise(resolve => {release = resolve})
  }})
  await store.saveConfig(1, config)
  const first = store.generate(1, "example.com", data)
  await ready
  expect(await store.generate(1, "example.com", data)).toMatchObject({ok: false, error: "busy"})
  await expect(store.removeConfig(1)).rejects.toMatchObject({code: "busy"})
  await expect(store.saveConfig(1, config)).rejects.toMatchObject({code: "busy"})
  expect(calls).toBe(1)
  release(response())
  expect(await first).toMatchObject({ok: true})
  expect(memory.locks.size).toBe(0)
})

test("a provider response echoing its credential cannot enter history or the public result", async () => {
  for (const apiKey of [config.apiKey, 'fixture-key"with\\escapes']) {
    const memory = memoryDatabase()
    const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key", request: async () => ({
      choices: [{message: {content: JSON.stringify({...modelOutput, summary: apiKey})}, finish_reason: "stop"}],
    })})
    await store.saveConfig(1, {...config, apiKey})
    const result = await store.generate(1, "example.com", data)
    expect(result).toMatchObject({ok: false, error: "invalid_response"})
    expect(JSON.stringify(result)).not.toContain(apiKey)
    expect(memory.reports).toHaveLength(0)
    expect(memory.locks.size).toBe(0)
  }
})

test("only two sites can generate at once and both successful and failed requests release capacity", async () => {
  function deferred<T>() {
    let resolve: (value: T) => void = () => {}
    let reject: (reason: unknown) => void = () => {}
    const promise = new Promise<T>((ok, fail) => {resolve = ok; reject = fail})
    return {promise, resolve, reject}
  }
  const memory = memoryDatabase()
  const gates = new Map(Array.from({length: 4}, (_, index) => [`site-${index + 1}`, {started: deferred<void>(), result: deferred<unknown>()}]))
  let calls = 0, active = 0, peak = 0
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key", request: async (_config, domain) => {
    calls++; active++; peak = Math.max(peak, active)
    const gate = gates.get(domain)!
    gate.started.resolve()
    try { return await gate.result.promise } finally {active--}
  }})
  for (let id = 1; id <= 4; id++) await store.saveConfig(id, config)
  const first = store.generate(1, "site-1", data)
  const second = store.generate(2, "site-2", data)
  await Promise.all([gates.get("site-1")!.started.promise, gates.get("site-2")!.started.promise])
  const before = memory.queries.length
  expect(await store.generate(3, "site-3", data)).toMatchObject({ok: false, error: "service_busy"})
  expect(memory.queries).toHaveLength(before)
  expect(calls).toBe(2)

  gates.get("site-1")!.result.resolve(response())
  expect(await first).toMatchObject({ok: true})
  const third = store.generate(3, "site-3", data)
  await gates.get("site-3")!.started.promise
  gates.get("site-2")!.result.reject(new SeoAiError("auth_error"))
  expect(await second).toMatchObject({ok: false, error: "auth_error"})
  const fourth = store.generate(4, "site-4", data)
  await gates.get("site-4")!.started.promise
  gates.get("site-3")!.result.resolve(response())
  gates.get("site-4")!.result.resolve(response())
  expect(await third).toMatchObject({ok: true})
  expect(await fourth).toMatchObject({ok: true})
  expect(peak).toBe(2)
  expect(active).toBe(0)
  expect(memory.locks.size).toBe(0)
})

test("another administrator changing the displayed service rejects generation before network or cooldown", async () => {
  const memory = memoryDatabase()
  let calls = 0
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "isolated-test-key", request: async () => {calls++; return response()}})
  const expected = {endpoint: config.endpoint, model: config.model, tokenParameter: config.tokenParameter}
  const changes: SeoAiConfig[] = [
    {...config, endpoint: "https://other.example.com/v1/chat/completions"},
    {...config, model: "other-model"},
    {...config, tokenParameter: "max_completion_tokens"},
  ]
  for (let index = 0; index < changes.length; index++) {
    const siteId = index + 1
    await store.saveConfig(siteId, config)
    await store.saveConfig(siteId, changes[index])
    expect(await store.generate(siteId, "example.com", data, expected)).toMatchObject({ok: false, error: "config_changed"})
    expect(memory.configs.get(siteId)?.retry_after).toBe(0)
  }
  expect(calls).toBe(0)
  expect(memory.locks.size).toBe(0)
  expect(await store.generate(3, "example.com", data, {...expected, tokenParameter: "max_completion_tokens"})).toMatchObject({ok: true})
  expect(calls).toBe(1)
})

test("secret rotation can recover configuration and new history without deleting unreadable older records", async () => {
  const memory = memoryDatabase()
  const store = createSeoAiStore({database: async () => memory.pool, secret: () => "old-fixture-secret", request: async () => response()})
  await store.saveConfig(1, config)
  expect(await store.generate(1, "example.com", data)).toMatchObject({ok: true})
  const original = memory.reports[0].encrypted
  const rotated = createSeoAiStore({database: async () => memory.pool, secret: () => "new-fixture-secret", request: async () => response()})
  await expect(rotated.getConfig(1)).rejects.toMatchObject({code: "config_error"})
  expect(await rotated.history(1)).toEqual({reports: [], unreadableCount: 1})
  await rotated.saveConfig(1, {...config, apiKey: "replacement-fixture-key"})
  expect(await rotated.getConfig(1)).toMatchObject({hasKey: true})
  memory.configs.get(1)!.retry_after = 0
  expect(await rotated.generate(1, "example.com", data)).toMatchObject({ok: true})
  const history = await rotated.history(1)
  expect(history.reports).toHaveLength(1)
  expect(history.unreadableCount).toBe(1)
  expect(memory.reports).toHaveLength(2)
  expect(memory.reports[0].encrypted).toBe(original)
  expect(await store.history(1)).toMatchObject({unreadableCount: 1})
})
