import { expect, test } from "bun:test"
import { createKeywordWorkspaceHandlers } from "../src/lib/keyword-workspace-actions"
import type { KeywordImportBatch, KeywordImportRow } from "../src/lib/keyword-import"
import type { KeywordPack } from "../src/lib/keyword-report"
import type { KeywordSeoData } from "../src/lib/seo-ai"

const expectedConfig = {endpoint: "https://api.example.com/v1/chat/completions", model: "fixture-model", tokenParameter: "max_completion_tokens" as const}
const range = {domain: "example.com", provider: "google" as const, from: "2026-10-01", to: "2026-10-22"}
const serverRows: KeywordImportRow[] = [{query: "server keyword", clicks: 5, impressions: 50, ctr: 0.1, position: 2.5}]
const readyPack: KeywordPack = {configured: true, rows: [{name: "server keyword", value: 5}], metrics: serverRows}
const importedBatch: KeywordImportBatch = {id: 71, provider: "bing", from: "2026-09-01", to: "2026-09-30", rowCount: 1,
  importedAt: "2026-10-22T12:00:00.000Z", rows: serverRows}

function fixture(options: {role?: string; member?: boolean; signedIn?: boolean; pack?: KeywordPack; rows?: KeywordImportRow[]; liveFailure?: boolean} = {}) {
  const calls: {access: string[]; terms: unknown[]; batches: unknown[]; generated: {siteId: number; domain: string; data: KeywordSeoData}[]} = {
    access: [], terms: [], batches: [], generated: [],
  }
  const handlers = createKeywordWorkspaceHandlers({
    user: async () => {if (options.signedIn === false) throw new Error("UNAUTH"); return {id: 7, email: "owner@fixture.invalid", name: "Owner"}},
    site: async (userId, domain, access) => {
      expect(userId).toBe(7); expect(domain).toBe(range.domain); calls.access.push(access || "read")
      const role = options.role || "owner"
      if (options.member === false || access === "admin" && !["owner", "admin"].includes(role)) return null
      return {id: 12, role, domain: range.domain, name: "Site", timezone: "UTC", allowed_event_props: null, team_id: 1, public: true}
    },
    terms: async (...args) => {
      calls.terms.push(args)
      if (options.liveFailure) throw new Error("provider unavailable")
      const pack = options.pack || {...readyPack, metrics: options.rows || serverRows}
      return {google: pack, bing: pack, organic: []}
    },
    batch: async (...args) => {calls.batches.push(args); return args[1] === importedBatch.id ? {...importedBatch, rows: options.rows || importedBatch.rows} : null},
    generate: async (siteId, domain, data, config) => {
      expect(config).toEqual(expectedConfig)
      calls.generated.push({siteId, domain, data})
      return {ok: true, report: {id: 91, createdAt: "2026-10-22T12:00:00.000Z", model: "fixture-model",
        summary: "Fixture summary", suggestions: [{keyword: data.rows[0].query, reason: "Fixture reason", action: "Fixture action", priority: "medium"}],
        provider: data.provider, scopeLabel: data.scopeLabel}}
    },
  })
  return {handlers, calls}
}

test("site owners and admins generate from server-loaded metrics, ignoring injected client rows", async () => {
  for (const role of ["owner", "admin"]) {
    const {handlers, calls} = fixture({role})
    const result = await handlers.generate({...range, source: "live", expectedConfig, rows: [{query: "injected", clicks: 99999}], scopeLabel: "injected scope", siteId: 999})
    expect(result.ok).toBe(true)
    expect(calls.access).toEqual(["admin"])
    expect(calls.terms).toEqual([[12, {from: range.from, to: range.to}, []]])
    expect(calls.generated).toHaveLength(1)
    expect(calls.generated[0]).toMatchObject({siteId: 12, domain: range.domain, data: {provider: "google", from: range.from, to: range.to, rows: serverRows}})
    expect(JSON.stringify(calls.generated)).not.toContain("injected")
  }
})

test("read-only site members may load live reports but may not generate suggestions", async () => {
  for (const role of ["viewer", "guest", "editor"]) {
    const {handlers, calls} = fixture({role})
    expect(await handlers.live(range)).toEqual(readyPack)
    await expect(handlers.generate({...range, source: "live", expectedConfig})).rejects.toThrow("没有权限")
    await expect(handlers.generate({domain: range.domain, source: "import", expectedConfig, id: 71})).rejects.toThrow("没有权限")
    expect(calls.access).toEqual(["read", "admin", "admin"])
    expect(calls.terms).toHaveLength(1)
    expect(calls.batches).toHaveLength(0)
    expect(calls.generated).toHaveLength(0)
  }
})

test("public-site visibility does not let non-members or signed-out users access keyword workspace data", async () => {
  for (const options of [{member: false}, {signedIn: false}]) {
    const {handlers, calls} = fixture(options)
    await expect(handlers.live(range)).rejects.toThrow()
    await expect(handlers.generate({...range, source: "live", expectedConfig})).rejects.toThrow()
    await expect(handlers.generate({domain: range.domain, source: "import", expectedConfig, id: 71})).rejects.toThrow()
    expect(calls.terms).toHaveLength(0)
    expect(calls.batches).toHaveLength(0)
    expect(calls.generated).toHaveLength(0)
  }
})

test("import generation scopes batch lookup to the authorized site and uses the stored provider and dates", async () => {
  const {handlers, calls} = fixture()
  await handlers.generate({domain: range.domain, source: "import", expectedConfig, id: 71, provider: "google", from: range.from, to: range.to,
    rows: [{query: "injected"}], siteId: 999})
  expect(calls.batches).toEqual([[12, 71]])
  expect(calls.terms).toHaveLength(0)
  expect(calls.generated[0].data).toMatchObject({provider: "bing", from: importedBatch.from, to: importedBatch.to, rows: serverRows})
  expect(calls.generated[0].data.scopeLabel).toContain("管理员声明的导出范围")
  await expect(handlers.generate({domain: range.domain, source: "import", expectedConfig, id: 900})).rejects.toThrow("不存在或不属于此站点")
  expect(calls.batches).toEqual([[12, 71], [12, 900]])
  expect(calls.generated).toHaveLength(1)
})

test("generation selects at most 50 server rows by impressions then clicks, without mutating the saved batch", async () => {
  const rows = Array.from({length: 60}, (_, index): KeywordImportRow => ({query: `server ${index}`, clicks: index, impressions: index * 10, ctr: index ? 0.1 : null, position: 5}))
  rows.push({query: "unknown impressions", clicks: 9999, impressions: null, ctr: null, position: null})
  rows.push({query: "tie high clicks", clicks: 59, impressions: 580, ctr: 59 / 580, position: 4})
  const original = JSON.stringify(rows)
  for (const source of ["live", "import"]) {
    const {handlers, calls} = fixture({rows})
    await handlers.generate(source === "live" ? {...range, source, expectedConfig} : {domain: range.domain, source, id: 71, expectedConfig})
    const sent = calls.generated[0].data.rows
    expect(sent).toHaveLength(50)
    expect(sent.slice(0, 3).map(row => row.query)).toEqual(["server 59", "tie high clicks", "server 58"])
    expect(sent.map(row => row.query)).not.toContain("unknown impressions")
    expect(sent.at(-1)?.query).toBe("server 11")
    expect(JSON.stringify(rows)).toBe(original)
  }
})

test("Bing generation does not claim selected dates or record dates describe its coverage", async () => {
  const pack: KeywordPack = {...readyPack, report: {metric: "clicks", limit: 50, scope: "site", rangeMode: "provider_available", updated: "weekly", dateFrom: "2026-09-05", dateTo: "2026-10-17"}}
  const {handlers, calls} = fixture({pack})
  await handlers.generate({...range, provider: "bing", source: "live", expectedConfig})
  const data = calls.generated[0].data
  expect(data.provider).toBe("bing")
  expect(data).not.toHaveProperty("from")
  expect(data).not.toHaveProperty("to")
  expect(data.scopeLabel).toContain("按周更新")
  expect(data.scopeLabel).toContain("不能按所选日期筛选")
  expect(data.scopeLabel).toContain("记录日期不代表精确覆盖范围")
})

test("provider connection failures, error reports and network errors never reach the AI generator", async () => {
  for (const options of [{pack: {...readyPack, configured: false}}, {pack: {...readyPack, error: "request_failed" as const}}, {liveFailure: true}]) {
    const {handlers, calls} = fixture(options)
    await expect(handlers.generate({...range, source: "live", expectedConfig})).rejects.toThrow()
    expect(calls.generated).toHaveLength(0)
  }
})

test("invalid calendar ranges and unsafe import ids are rejected before data loading", async () => {
  const {handlers, calls} = fixture()
  for (const patch of [{from: "2026-02-30"}, {to: "2026-09-30"}, {from: "last24h"}]) {
    await expect(handlers.live({...range, ...patch})).rejects.toThrow()
    await expect(handlers.generate({...range, ...patch, source: "live", expectedConfig})).rejects.toThrow()
  }
  for (const id of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(handlers.generate({domain: range.domain, source: "import", expectedConfig, id})).rejects.toThrow()
  }
  expect(calls.terms).toHaveLength(0)
  expect(calls.batches).toHaveLength(0)
  expect(calls.generated).toHaveLength(0)
})

test("generation requires an explicit saved model destination, including for imported data", async () => {
  const {handlers, calls} = fixture()
  for (const source of [{...range, source: "live"}, {domain: range.domain, source: "import", id: 71}]) {
    await expect(handlers.generate(source)).rejects.toThrow()
    for (const config of [{}, {...expectedConfig, endpoint: "http://127.0.0.1/chat/completions"}, {...expectedConfig, model: ""}]) {
      await expect(handlers.generate({...source, expectedConfig: config})).rejects.toThrow()
    }
  }
  expect(calls.access).toHaveLength(0)
  expect(calls.generated).toHaveLength(0)
})
