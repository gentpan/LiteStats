import { expect, test } from "bun:test"
import { bingKeywordReport, dashboardKeywordPack, googleKeywordReport, googleProperties, keywordJson, KeywordRequestError } from "../src/lib/keyword-report"

type MockFetch = (url: string, init?: RequestInit) => Promise<Response>

const googleAuth = async () => ({property: "https://example.com/", access_token: "test-token"})
const bingAuth = async () => ({site_url: "https://example.com/", api_key: "test-key"})
const range = {from: "2026-10-01", to: "2026-10-22", timezone: "Asia/Shanghai"}
const json = (body: unknown, status = 200) => (async () => Response.json(body, {status})) as MockFetch

test("Google uses the exact official property, calendar days and clicks with a bounded result", async () => {
  let url = ""
  let request: RequestInit | undefined
  const report = await googleKeywordReport(googleAuth, range, {fetcher: (async (input, init) => {
    url = String(input)
    request = init
    return Response.json({rows: Array.from({length: 60}, (_, n) => ({keys: [`query ${n}`], clicks: n}))})
  }) as MockFetch})
  expect(url).toContain("sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query")
  expect(JSON.parse(String(request?.body))).toEqual({startDate: range.from, endDate: range.to, dimensions: ["query"], rowLimit: 50, startRow: 0})
  expect(request?.signal).toBeInstanceOf(AbortSignal)
  expect(report.rows).toHaveLength(50)
  expect(report.rows[0]).toEqual({name: "query 59", value: 59})
  expect(report.report).toEqual({metric: "clicks", limit: 50, scope: "site", resource: "https://example.com/", rangeMode: "selected_days", timezone: "America/Los_Angeles", dateFrom: range.from, dateTo: range.to})
})

test("Google reports connection and property selection separately from unsupported dates", async () => {
  let calls = 0
  const options = {fetcher: (async () => {calls++; return Response.json({})}) as MockFetch}
  expect(await googleKeywordReport(async () => null, range, options)).toMatchObject({configured: false, rows: []})
  expect(await googleKeywordReport(async () => ({property: null, access_token: "test"}), range, options)).toMatchObject({configured: true, error: "property_required"})
  for (const invalid of [
    {from: "realtime", to: "realtime"}, {from: "last24h", to: "last24h"},
    {from: "2026-02-30", to: "2026-03-01"}, {from: "2026-10-22", to: "2026-10-01"},
  ]) expect(await googleKeywordReport(googleAuth, invalid, options)).toMatchObject({configured: true, error: "period_unsupported", rows: []})
  expect(calls).toBe(0)
})

test("valid empty results stay connected while malformed Google payloads are explicit errors", async () => {
  for (const body of [{}, {rows: []}]) {
    const report = await googleKeywordReport(googleAuth, range, {fetcher: json(body)})
    expect(report.configured).toBe(true)
    expect(report.error).toBeUndefined()
    expect(report.rows).toEqual([])
  }
  for (const body of [null, {rows: {}}, {rows: [{keys: ["word"], clicks: -1}]}, {rows: [{keys: ["word"], clicks: "3"}]}, {error: {message: "provider fault"}}]) {
    expect(await googleKeywordReport(googleAuth, range, {fetcher: json(body)})).toMatchObject({configured: true, error: "invalid_response", rows: []})
  }
})

test("Bing aggregates repeated queries and reports all provider data instead of selected daily coverage", async () => {
  const report = await bingKeywordReport(bingAuth, {fetcher: json({d: [
    {Query: "statistics", Clicks: 10, Date: "/Date(1316156400000-0700)/"},
    {Query: "statistics", Clicks: 12, Date: "2011-09-23T00:00:00-07:00"},
    {Query: "analytics", Clicks: 5, Date: "2011-09-23"},
  ]})})
  expect(report.rows).toEqual([{name: "statistics", value: 22}, {name: "analytics", value: 5}])
  expect(report.report).toEqual({metric: "clicks", limit: 50, scope: "site", resource: "https://example.com/", rangeMode: "provider_available", updated: "weekly", dateFrom: "2011-09-16", dateTo: "2011-09-23"})
})

test("Bing date labels preserve provider offsets and never infer coverage from incomplete dates", async () => {
  const epoch = Date.parse("2026-10-22T02:00:00Z")
  const report = await bingKeywordReport(bingAuth, {fetcher: json({d: [{Query: "query", Clicks: 1, Date: `/Date(${epoch}-0700)/`}]})})
  expect(report.report?.dateFrom).toBe("2026-10-21")
  for (const invalid of [undefined, "2026-02-30", "/Date(999999999999999999)/", `/Date(${epoch}+2461)/`, "unknown"]) {
    const partial = await bingKeywordReport(bingAuth, {fetcher: json({d: [
      {Query: "valid", Clicks: 2, Date: "2026-10-22"},
      {Query: "undated", Clicks: 1, Date: invalid},
    ]})})
    expect(partial.rows).toHaveLength(2)
    expect(partial.report?.dateFrom).toBeUndefined()
    expect(partial.report?.dateTo).toBeUndefined()
  }
})

test("Bing keeps actual zero clicks, caps the aggregate at 50, and rejects invalid metrics", async () => {
  expect((await bingKeywordReport(bingAuth, {fetcher: json({d: [{Query: "query", Clicks: 0}]})})).rows).toEqual([{name: "query", value: 0}])
  const limited = await bingKeywordReport(bingAuth, {fetcher: json({d: Array.from({length: 70}, (_, n) => ({Query: `word ${n}`, Clicks: n}))})})
  expect(limited.rows).toHaveLength(50)
  expect(limited.rows[0].value).toBe(69)
  for (const body of [{}, {d: null}, {d: {}}, {d: [{Query: "word", Clicks: -1}]}, {d: [{Query: "word"}]}]) {
    expect(await bingKeywordReport(bingAuth, {fetcher: json(body)})).toMatchObject({configured: true, error: "invalid_response", rows: []})
  }
})

test("HTTP and OAuth errors distinguish reauthorization from temporary provider failures", async () => {
  for (const [status, body, code] of [
    [401, {}, "auth_error"], [403, {}, "auth_error"], [400, {error: "invalid_grant"}, "auth_error"],
    [429, {}, "request_failed"], [500, {}, "request_failed"],
  ] as const) {
    expect(await googleKeywordReport(googleAuth, range, {fetcher: json(body, status)})).toMatchObject({configured: true, error: code})
    expect(await bingKeywordReport(bingAuth, {fetcher: json(body, status)})).toMatchObject({configured: true, error: code})
  }
  expect(await googleKeywordReport(async () => {throw new KeywordRequestError("auth_error")}, range)).toMatchObject({configured: true, error: "auth_error"})
})

test("load failures cannot be mislabeled as an unconfigured connection", async () => {
  const unavailable = async () => {throw new Error("local configuration unavailable")}
  expect(await googleKeywordReport(unavailable, range)).toMatchObject({configured: true, error: "request_failed"})
  expect(await bingKeywordReport(unavailable)).toMatchObject({configured: true, error: "request_failed"})
  expect(await bingKeywordReport(async () => null)).toMatchObject({configured: false, rows: []})
})

test("a failing provider does not discard successful results from the other provider", async () => {
  const [google, bing] = await Promise.all([
    googleKeywordReport(googleAuth, range, {fetcher: (async () => {throw new Error("network unavailable")}) as MockFetch}),
    bingKeywordReport(bingAuth, {fetcher: json({d: [{Query: "retained", Clicks: 7}]})}),
  ])
  expect(google).toMatchObject({configured: true, error: "request_failed"})
  expect(bing.rows).toEqual([{name: "retained", value: 7}])
})

test("the timeout bounds headers and slow JSON bodies, aborts requests and keeps credentials out of errors", async () => {
  for (const phase of ["headers", "json"]) {
    let signal: AbortSignal | null | undefined
    const fetcher = (async (_url, init) => {
      signal = init?.signal
      if (phase === "headers") return await new Promise<Response>(() => {})
      return {ok: true, status: 200, json: () => new Promise(() => {})} as Response
    }) as MockFetch
    const started = Date.now()
    const report = await bingKeywordReport(bingAuth, {fetcher, timeoutMs: 15})
    expect(report).toMatchObject({configured: true, error: "request_timeout", rows: []})
    expect(Date.now() - started).toBeLessThan(500)
    expect(signal?.aborted).toBe(true)
    expect(JSON.stringify(report)).not.toContain("test-key")
  }
  await expect(keywordJson("https://provider.test/?apikey=secret", {}, {fetcher: (async () => {throw new Error("fetch secret failed")}) as MockFetch})).rejects.toThrow("request_failed")
})

test("invalid JSON and HTML error responses cannot become a successful empty report", async () => {
  for (const [status, error] of [[200, "invalid_response"], [401, "auth_error"], [503, "request_failed"]] as const) {
    const fetcher = (async () => new Response("<html>provider unavailable</html>", {status})) as MockFetch
    expect(await bingKeywordReport(bingAuth, {fetcher})).toMatchObject({configured: true, error})
  }
})

test("Search Console property identifiers retain URL-prefix trailing slashes and domain prefixes", () => {
  expect(googleProperties({siteEntry: [
    {siteUrl: "https://example.com/", permissionLevel: "siteOwner"},
    {siteUrl: "https://example.com/blog/", permissionLevel: "siteFullUser"},
    {siteUrl: "sc-domain:example.com", permissionLevel: "siteRestrictedUser"},
    {siteUrl: "https://unverified.example/", permissionLevel: "siteUnverifiedUser"},
  ]})).toEqual(["https://example.com/", "https://example.com/blog/", "sc-domain:example.com"])
  expect(() => googleProperties({siteEntry: {}})).toThrow("invalid_response")
})

test("Google includes impressions, exact CTR and impression-weighted positions without changing legacy rows", async () => {
  const report = await googleKeywordReport(googleAuth, range, {fetcher: json({rows: [
    {keys: ["analytics"], clicks: 2, impressions: 10, ctr: 0.2, position: 2},
    {keys: ["analytics"], clicks: 9, impressions: 90, ctr: 0.1, position: 8},
    {keys: ["other"], clicks: 1, impressions: 3, ctr: 0.33, position: 4.5},
  ]})})
  expect(report.rows).toEqual([{name: "analytics", value: 11}, {name: "other", value: 1}])
  expect(report.metrics).toEqual([
    {query: "analytics", clicks: 11, impressions: 100, ctr: 0.11, position: 7.4},
    {query: "other", clicks: 1, impressions: 3, ctr: 1 / 3, position: 4.5},
  ])
})

test("Bing uses average impression position, not average click position or unweighted means", async () => {
  const report = await bingKeywordReport(bingAuth, {fetcher: json({d: [
    {Query: "query", Clicks: 2, Impressions: 10, AvgImpressionPosition: 2, AvgClickPosition: 1, Date: "2026-10-10"},
    {Query: "query", Clicks: 9, Impressions: 90, AvgImpressionPosition: 8, AvgClickPosition: 3, Date: "2026-10-17"},
  ]})})
  expect(report.rows).toEqual([{name: "query", value: 11}])
  expect(report.metrics).toEqual([{query: "query", clicks: 11, impressions: 100, ctr: 0.11, position: 7.4}])
  expect(report.report).toMatchObject({rangeMode: "provider_available", updated: "weekly", dateFrom: "2026-10-10", dateTo: "2026-10-17"})
})

test("missing provider metrics remain null and partial aggregates never invent denominators or rankings", async () => {
  const report = await bingKeywordReport(bingAuth, {fetcher: json({d: [
    {Query: "missing impressions", Clicks: 1, Impressions: 10, AvgImpressionPosition: 2},
    {Query: "missing impressions", Clicks: 2, AvgImpressionPosition: 8},
    {Query: "missing rank", Clicks: 1, Impressions: 10, AvgImpressionPosition: 2},
    {Query: "missing rank", Clicks: 2, Impressions: 90},
    {Query: "clicks only", Clicks: 1},
    {Query: "zero", Clicks: 0, Impressions: 0, AvgImpressionPosition: 0},
  ]})})
  expect(report.metrics).toEqual([
    {query: "missing impressions", clicks: 3, impressions: null, ctr: null, position: null},
    {query: "missing rank", clicks: 3, impressions: 100, ctr: 0.03, position: null},
    {query: "clicks only", clicks: 1, impressions: null, ctr: null, position: null},
    {query: "zero", clicks: 0, impressions: 0, ctr: null, position: null},
  ])
  expect(report.report?.dateFrom).toBeUndefined()
  const google = await googleKeywordReport(googleAuth, range, {fetcher: json({rows: [
    {keys: ["single"], clicks: 1, ctr: 0.2, position: 4},
    {keys: ["repeat"], clicks: 2, impressions: 10, ctr: 0.2, position: 2},
    {keys: ["repeat"], clicks: 1, ctr: 0.1, position: 8},
  ]})})
  expect(google.metrics).toEqual([
    {query: "repeat", clicks: 3, impressions: null, ctr: null, position: null},
    {query: "single", clicks: 1, impressions: null, ctr: 0.2, position: 4},
  ])
})

test("extended metrics follow the same top-50 order as the legacy keyword chart", async () => {
  const report = await googleKeywordReport(googleAuth, range, {fetcher: json({rows: Array.from({length: 65}, (_, index) => ({
    keys: [`query ${index}`], clicks: index, impressions: 100, position: index + 1,
  }))})})
  expect(report.metrics).toHaveLength(50)
  expect(report.metrics?.map(row => ({name: row.query, value: row.clicks}))).toEqual(report.rows)
})

test("malformed extra metrics and overflowing totals are explicit provider errors", async () => {
  for (const patch of [{impressions: -1}, {impressions: "4"}, {ctr: 1.5}, {position: "2"}, {position: -1}, {impressions: 0}]) {
    expect(await googleKeywordReport(googleAuth, range, {fetcher: json({rows: [{keys: ["query"], clicks: 1, ...patch}]})})).toMatchObject({error: "invalid_response", rows: []})
  }
  for (const patch of [{Impressions: -1}, {Impressions: "10"}, {AvgImpressionPosition: "2"}]) {
    expect(await bingKeywordReport(bingAuth, {fetcher: json({d: [{Query: "query", Clicks: 1, ...patch}]})})).toMatchObject({error: "invalid_response", rows: []})
  }
  expect(await bingKeywordReport(bingAuth, {fetcher: json({d: [
    {Query: "query", Clicks: Number.MAX_SAFE_INTEGER}, {Query: "query", Clicks: 1},
  ]})})).toMatchObject({error: "invalid_response", rows: []})
})

test("Microsoft timestamps outside the supported calendar never create malformed record-date labels", async () => {
  for (const value of ["/Date(8640000000000000)/", "/Date(-62167219200000)/", "/Date(-8640000000000000)/"]) {
    const report = await bingKeywordReport(bingAuth, {fetcher: json({d: [{Query: "word", Clicks: 1, Date: value}]})})
    expect(report.rows).toEqual([{name: "word", value: 1}])
    expect(report.report?.dateFrom).toBeUndefined()
    expect(report.report?.dateTo).toBeUndefined()
  }
})

test("zero impressions cannot report a known rank, while fractional positions below one are invalid", async () => {
  const report = await googleKeywordReport(googleAuth, range, {fetcher: json({rows: [{keys: ["word"], clicks: 0, impressions: 0, position: 2}]})})
  expect(report.metrics).toEqual([{query: "word", clicks: 0, impressions: 0, ctr: null, position: null}])
  expect(await bingKeywordReport(bingAuth, {fetcher: json({d: [{Query: "word", Clicks: 0, AvgImpressionPosition: 0.5}]})})).toMatchObject({error: "invalid_response", rows: []})
})

test("report metadata preserves the authorized property path and never includes API credentials", async () => {
  const google = await googleKeywordReport(async () => ({property: "https://example.com/blog/", access_token: "private-token"}), range, {fetcher: json({rows: []})})
  const bing = await bingKeywordReport(async () => ({site_url: "https://example.com/blog/", api_key: "private-key"}), {fetcher: json({d: []})})
  expect(google.report?.resource).toBe("https://example.com/blog/")
  expect(bing.report?.resource).toBe("https://example.com/blog/")
  expect(JSON.stringify([google, bing])).not.toContain("private-")
})

test("legacy dashboard payloads whitelist click data without exposing workspace metrics or future private fields", async () => {
  const report = await googleKeywordReport(googleAuth, range, {fetcher: json({rows: [{keys: ["word"], clicks: 1, impressions: 20, position: 3}]})})
  const extended = {...report, privateField: "should not leak", rows: [{name: "word", value: 1, privateRow: "hidden"}],
    report: {...report.report!, privateReport: "hidden"}}
  expect(dashboardKeywordPack(extended)).toEqual({
    configured: true, rows: [{name: "word", value: 1}],
    report: {metric: "clicks", limit: 50, scope: "site", rangeMode: "selected_days", timezone: "America/Los_Angeles", dateFrom: range.from, dateTo: range.to},
  })
  expect(dashboardKeywordPack({configured: true, rows: [], metrics: [], error: "request_timeout"})).toEqual({configured: true, rows: [], error: "request_timeout"})
  expect(dashboardKeywordPack({configured: false, rows: []})).toEqual({configured: false, rows: []})
  expect(report.metrics).toHaveLength(1)
  expect(report.report?.resource).toBe("https://example.com/")
})
