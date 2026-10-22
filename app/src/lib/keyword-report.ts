import type { Row } from "./ch"
import type { Range } from "./range"
import { isCalendarDate, isDateRange } from "./date-time"
import type { KeywordImportRow } from "./keyword-import"

type KeywordError = "auth_error" | "request_failed" | "request_timeout" | "invalid_response" | "period_unsupported" | "property_required"

export type KeywordPack = {
  configured: boolean
  rows: Row[]
  /** Same queries/order/limit as rows, with unavailable provider metrics kept null. */
  metrics?: KeywordImportRow[]
  error?: KeywordError
  report?: {
    metric: "clicks"
    limit: 50
    scope: "site"
    /** Authenticated source property, including URL-prefix paths when configured. */
    resource?: string
    rangeMode: "selected_days" | "provider_available"
    timezone?: "America/Los_Angeles"
    updated?: "weekly"
    /** Bing dates identify returned records, not inferred daily coverage boundaries. */
    dateFrom?: string
    dateTo?: string
  }
}

/** Legacy dashboards and share links expose only their original click-list contract. */
export function dashboardKeywordPack(pack: KeywordPack): KeywordPack {
  const report = pack.report
  return {
    configured: pack.configured,
    rows: pack.rows.map(row => ({name: row.name, value: row.value})),
    ...(pack.error ? {error: pack.error} : {}),
    ...(report ? {report: {
      metric: report.metric, limit: report.limit, scope: report.scope, rangeMode: report.rangeMode,
      ...(report.timezone ? {timezone: report.timezone} : {}),
      ...(report.updated ? {updated: report.updated} : {}),
      ...(report.dateFrom ? {dateFrom: report.dateFrom} : {}),
      ...(report.dateTo ? {dateTo: report.dateTo} : {}),
    }} : {}),
  }
}

export class KeywordRequestError extends Error {
  constructor(readonly code: KeywordError) {
    super(code)
  }
}

type RequestOptions = { fetcher?: (url: string, init?: RequestInit) => Promise<Response>, timeoutMs?: number }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** Bound both response headers and JSON reading; errors never contain tokens or request URLs. */
export async function keywordJson(url: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<unknown> {
  const controller = new AbortController()
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 5_000, 5_000))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new KeywordRequestError("request_timeout"))
      controller.abort()
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await (options.fetcher || fetch)(url, {...init, signal: controller.signal})
        let body: unknown
        try { body = await response.json() } catch {
          if (response.status === 401 || response.status === 403) throw new KeywordRequestError("auth_error")
          throw new KeywordRequestError(response.ok ? "invalid_response" : "request_failed")
        }
        if (!response.ok) {
          const oauthError = record(body)?.error
          const denied = response.status === 401 || response.status === 403 ||
            (typeof oauthError === "string" && ["invalid_grant", "invalid_client", "unauthorized_client", "access_denied"].includes(oauthError))
          throw new KeywordRequestError(denied ? "auth_error" : "request_failed")
        }
        return body
      })(),
      timeout,
    ])
  } catch (error) {
    throw error instanceof KeywordRequestError ? error : new KeywordRequestError("request_failed")
  } finally {
    clearTimeout(timer)
  }
}

function failure(error: unknown, report?: KeywordPack["report"]): KeywordPack {
  return {configured: true, rows: [], error: error instanceof KeywordRequestError ? error.code : "request_failed", report}
}

function clicks(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null
}

function optionalMetric(value: unknown, field: "impressions" | "ctr" | "position") {
  if (value == null) return null
  const number = clicks(value)
  if (number === null || (field === "ctr" && number > 1) || (field === "position" && number > 0 && number < 1)) throw new KeywordRequestError("invalid_response")
  // A zero average position is an unavailable-rank sentinel, never first place.
  return field === "position" && number < 1 ? null : number
}

type CompleteClicks = KeywordImportRow & {clicks: number}
function aggregate(input: CompleteClicks[]): {rows: Row[]; metrics: KeywordImportRow[]} {
  const groups = new Map<string, CompleteClicks[]>()
  for (const row of input) {
    const group = groups.get(row.query)
    if (group) group.push(row)
    else groups.set(row.query, [row])
  }
  const safeTotal = (values: number[]) => {
    const value = values.reduce((total, item) => total + item, 0)
    if (clicks(value) === null) throw new KeywordRequestError("invalid_response")
    return value
  }
  const metrics = [...groups].map(([query, group]): CompleteClicks => {
    const valueClicks = safeTotal(group.map(row => row.clicks))
    const impressions = group.every(row => row.impressions !== null) ? safeTotal(group.map(row => row.impressions!)) : null
    if (impressions !== null && valueClicks > impressions) throw new KeywordRequestError("invalid_response")
    // Do not average rounded CTRs or positions, or fill a missing week's impressions with zero.
    const ctr = impressions !== null ? (impressions > 0 ? valueClicks / impressions : null) : group.length === 1 ? group[0].ctr : null
    const position = impressions === 0 ? null : group.length === 1 ? group[0].position : impressions !== null && impressions > 0 && group.every(row => row.position !== null)
      ? group.reduce((total, row) => total + row.position! * (row.impressions! / impressions), 0) : null
    if (ctr !== null && ctr > 1) throw new KeywordRequestError("invalid_response")
    return {query, clicks: valueClicks, impressions, ctr, position}
  }).sort((a, b) => b.clicks - a.clicks || a.query.localeCompare(b.query)).slice(0, 50)
  return {rows: metrics.map(row => ({name: row.query, value: row.clicks})), metrics}
}

export async function googleKeywordReport(
  loadAuth: () => Promise<{property: string | null, access_token: string} | null>,
  range: Range,
  options: RequestOptions = {},
): Promise<KeywordPack> {
  const report: KeywordPack["report"] = {metric: "clicks", limit: 50, scope: "site", rangeMode: "selected_days", timezone: "America/Los_Angeles"}
  try {
    const auth = await loadAuth()
    if (!auth) return {configured: false, rows: [], report}
    if (!auth.property) throw new KeywordRequestError("property_required")
    report.resource = auth.property
    if (!isDateRange(range.from, range.to)) throw new KeywordRequestError("period_unsupported")
    report.dateFrom = range.from
    report.dateTo = range.to
    const body = record(await keywordJson(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(auth.property)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json"},
        body: JSON.stringify({startDate: range.from, endDate: range.to, dimensions: ["query"], rowLimit: 50, startRow: 0}),
      }, options,
    ))
    // Google omits rows entirely for a successful empty result.
    if (!body || body.error || (body.rows !== undefined && !Array.isArray(body.rows))) throw new KeywordRequestError("invalid_response")
    const rows = (body.rows || []) as unknown[]
    const parsed = rows.map(value => {
      const row = record(value)
      const name = Array.isArray(row?.keys) && typeof row.keys[0] === "string" ? row.keys[0].trim() : ""
      const valueClicks = clicks(row?.clicks)
      if (!name || valueClicks === null) throw new KeywordRequestError("invalid_response")
      return {query: name, clicks: valueClicks,
        impressions: optionalMetric(row?.impressions, "impressions"),
        ctr: optionalMetric(row?.ctr, "ctr"), position: optionalMetric(row?.position, "position")}
    })
    return {configured: true, ...aggregate(parsed), report}
  } catch (error) { return failure(error, report) }
}

/** Preserve the date shown by the provider, including the offset in Microsoft JSON dates. */
function bingRecordDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const ms = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value)
  if (ms) {
    const offset = ms[2]
    const hours = offset ? Number(offset.slice(1, 3)) : 0
    const minutes = offset ? Number(offset.slice(3, 5)) : 0
    if (hours > 23 || minutes > 59) return undefined
    const shift = offset ? (offset[0] === "-" ? -1 : 1) * (hours * 60 + minutes) * 60_000 : 0
    const date = new Date(Number(ms[1]) + shift)
    const calendar = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined
    return isCalendarDate(calendar) ? calendar : undefined
  }
  const date = value.slice(0, 10)
  if (isCalendarDate(date) && (value.length === 10 || /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)))) return date
  return undefined
}

export async function bingKeywordReport(
  loadAuth: () => Promise<{api_key: string, site_url: string | null} | null>,
  options: RequestOptions = {},
): Promise<KeywordPack> {
  // GetQueryStats accepts only siteUrl and updates weekly. Its Date field does not
  // document daily bucket boundaries, so never pretend the dashboard date filter applies.
  const report: KeywordPack["report"] = {metric: "clicks", limit: 50, scope: "site", rangeMode: "provider_available", updated: "weekly"}
  try {
    const auth = await loadAuth()
    if (!auth?.api_key || !auth.site_url) return {configured: false, rows: [], report}
    report.resource = auth.site_url
    const url = `https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=${encodeURIComponent(auth.api_key)}&siteUrl=${encodeURIComponent(auth.site_url)}`
    const body = record(await keywordJson(url, {headers: {Accept: "application/json"}}, options))
    if (!body || !Array.isArray(body.d)) throw new KeywordRequestError("invalid_response")
    const dates: string[] = []
    const parsed = body.d.map(value => {
      const row = record(value)
      const rawName = row?.Query ?? row?.query
      const name = typeof rawName === "string" ? rawName.trim() : ""
      const valueClicks = clicks(row?.Clicks ?? row?.clicks)
      if (!name || valueClicks === null) throw new KeywordRequestError("invalid_response")
      const date = bingRecordDate(row?.Date ?? row?.date)
      if (date) dates.push(date)
      // QueryStats distinguishes average impression position from average click position.
      return {query: name, clicks: valueClicks, impressions: optionalMetric(row?.Impressions ?? row?.impressions, "impressions"),
        ctr: null, position: optionalMetric(row?.AvgImpressionPosition ?? row?.avgImpressionPosition, "position")}
    })
    dates.sort()
    // Omit date bounds when any row lacks a usable date, instead of implying full coverage.
    if (dates.length && dates.length === parsed.length) {
      report.dateFrom = dates[0]
      report.dateTo = dates[dates.length - 1]
    }
    return {configured: true, ...aggregate(parsed), report}
  } catch (error) { return failure(error, report) }
}

export function googleProperties(body: unknown): string[] {
  const root = record(body)
  if (!root || root.error || (root.siteEntry !== undefined && !Array.isArray(root.siteEntry))) throw new KeywordRequestError("invalid_response")
  const permissions = new Set(["siteOwner", "siteFullUser", "siteRestrictedUser"])
  return ((root.siteEntry || []) as unknown[]).flatMap(value => {
    const row = record(value)
    return typeof row?.siteUrl === "string" && permissions.has(String(row.permissionLevel)) ? [row.siteUrl] : []
  })
}
