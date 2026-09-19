import { createClient, type ClickHouseClient } from "@clickhouse/client"
import { CLICKHOUSE_URL } from "./env"
import { compareRange, isoDate, parseDate, type Interval, type Range } from "./range"

let client: ClickHouseClient | null = null

export function ch() {
  if (!client) {
    const u = new URL(CLICKHOUSE_URL)
    const database = u.pathname.replace(/^\//, "") || "default"
    client = createClient({
      url: `${u.protocol}//${u.host}`,
      username: u.username || "default",
      password: u.password || "",
      database,
    })
  }
  return client
}

function esc(s: string) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

export type Filter = {
  hostname?: string
  utm?: string
  source?: string
  page?: string
  country?: string
  browser?: string
  os?: string
  device?: string
}

function where(siteId: number, range: Range, filter: Filter = {}, extra = "") {
  const parts = [`site_id = ${siteId}`]
  if (range.from === "realtime") {
    parts.push("timestamp >= now() - INTERVAL 30 MINUTE")
  } else if (range.from === "realtime-prev") {
    parts.push("timestamp >= now() - INTERVAL 60 MINUTE")
    parts.push("timestamp < now() - INTERVAL 30 MINUTE")
  } else if (range.from === "last24h") {
    parts.push("timestamp >= now() - INTERVAL 24 HOUR")
  } else if (range.from === "last24h-prev") {
    parts.push("timestamp >= now() - INTERVAL 48 HOUR")
    parts.push("timestamp < now() - INTERVAL 24 HOUR")
  } else {
    parts.push(`timestamp >= toDateTime('${esc(range.from)} 00:00:00', '${esc(range.timezone || 'UTC')}')`)
    parts.push(`timestamp < toDateTime('${esc(range.to)} 00:00:00', '${esc(range.timezone || 'UTC')}') + INTERVAL 1 DAY`)
  }
  if (filter.hostname) parts.push(`hostname = '${esc(filter.hostname)}'`)
  if (filter.utm) parts.push(`utm_source = '${esc(filter.utm)}'`)
  if (filter.source) {
    parts.push(filter.source === "Direct"
      ? `(referrer_source = '' OR referrer_source = 'Direct')`
      : `referrer_source = '${esc(filter.source)}'`)
  }
  if (filter.page) parts.push(`pathname = '${esc(filter.page)}'`)
  if (filter.country && filter.country !== "(none)") parts.push(`country_code = '${esc(filter.country)}'`)
  if (filter.country === "(none)") parts.push(`country_code = ''`)
  if (filter.browser) parts.push(`browser = '${esc(filter.browser === "(none)" ? "" : filter.browser)}'`)
  if (filter.os) parts.push(`operating_system = '${esc(filter.os === "(none)" ? "" : filter.os)}'`)
  if (filter.device) parts.push(`screen_size = '${esc(filter.device === "(none)" ? "" : filter.device)}'`)
  if (extra) parts.push(extra)
  return parts.join(" AND ")
}

export type Overview = {
  visitors: number
  pageviews: number
  visits: number
  bounce_rate: number
  views_per_visit: number
  visit_duration: number
  live: number
}
export type Row = { name: string, value: number, code?: string }
export type Point = { date: string, value: number }
export type MetricKey = "visitors" | "visits" | "pageviews" | "views_per_visit" | "bounce_rate" | "visit_duration"
export type SeriesBy = Record<MetricKey, Point[]>

async function query<T>(sql: string): Promise<T[]> {
  const res = await ch().query({ query: sql, format: "JSONEachRow" })
  return await res.json<T>()
}

export async function hasSiteEvents(siteId: number) {
  const [row] = await query<{ n: string }>(`SELECT toString(count()) AS n FROM events_v2 WHERE site_id = ${siteId}`)
  return Number(row?.n || 0) > 0
}

function bucketExpr(range: Range, interval: Interval) {
  const time = `toTimeZone(sess.mn, '${esc(range.timezone || "UTC")}')`
  if (range.from.startsWith("realtime")) return `toStartOfMinute(${time})`
  if (interval === "minute") return `toStartOfMinute(${time})`
  if (interval === "hour" || range.from.startsWith("last24h")) return `toStartOfHour(${time})`
  if (interval === "week") return `toMonday(${time})`
  if (interval === "month") return `toStartOfMonth(${time})`
  return `toDate(${time})`
}

function bucketLabelSql(range: Range, interval: Interval) {
  const expr = bucketExpr(range, interval)
  if (interval === "minute" || interval === "hour" || range.from.startsWith("realtime") || range.from.startsWith("last24h")) {
    return `formatDateTime(${expr}, '%Y-%m-%d %H:%i:%S')`
  }
  return `toString(toDate(${expr}))`
}

function emptyMetrics(date: string) {
  return { date, visitors: "0", visits: "0", pageviews: "0", bounce_rate: "0", views_per_visit: "0", visit_duration: "0" }
}

function nextBucket(date: string, interval: Interval) {
  if (date.includes(" ")) {
    const d = new Date(date.replace(" ", "T"))
    d.setMinutes(d.getMinutes() + (interval === "minute" ? 1 : 60))
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const d = parseDate(date)
  if (interval === "week") d.setDate(d.getDate() + 7)
  else if (interval === "month") d.setMonth(d.getMonth() + 1)
  else d.setDate(d.getDate() + 1)
  return isoDate(d)
}

function fillSeries(
  rows: Array<{ date: string, visitors: string, visits: string, pageviews: string, bounce_rate: string, views_per_visit: string, visit_duration: string }>,
  range: Range,
  interval: Interval,
) {
  if (!range.from.startsWith("20") || !range.to.startsWith("20")) return rows
  const map = new Map(rows.map((r) => [r.date.slice(0, interval === "hour" || interval === "minute" ? 16 : 10), r]))
  const start = interval === "hour"
    ? `${range.from} 00:00:00`
    : interval === "minute"
      ? `${range.from} 00:00:00`
      : range.from
  const end = interval === "hour"
    ? `${range.to} 23:00:00`
    : interval === "minute"
      ? `${range.to} 23:59:00`
      : range.to
  const out = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 4000) {
    const key = cur.slice(0, interval === "hour" || interval === "minute" ? 16 : 10)
    const hit = [...map.values()].find((r) => r.date.startsWith(key))
    out.push(hit || emptyMetrics(cur))
    cur = nextBucket(cur, interval)
    guard += 1
  }
  return out.length ? out : rows
}

async function overviewOnce(siteId: number, range: Range, filter: Filter, interval: Interval = "day"): Promise<{ overview: Omit<Overview, "live">, series: Point[], seriesBy: SeriesBy }> {
  const w = where(siteId, range, filter)
  const bucket = bucketLabelSql(range, interval)
  const [over] = await query<{ visitors: string, pageviews: string, visits: string, bounces: string, duration: string }>(`
    SELECT
      toString(uniqExact(sess.uid)) AS visitors,
      toString(sum(sess.pv)) AS pageviews,
      toString(uniqExact(sess.sid)) AS visits,
      toString(countIf(sess.pv = 1)) AS bounces,
      toString(ifNotFinite(avg(sess.dur), 0)) AS duration
    FROM (
      SELECT
        user_id AS uid,
        session_id AS sid,
        countIf(name = 'pageview') AS pv,
        greatest(dateDiff('second', min(timestamp), max(timestamp)), 0) AS dur
      FROM events_v2
      WHERE ${w}
      GROUP BY user_id, session_id
    ) AS sess
  `)
  const daily = await query<{ date: string, visitors: string, visits: string, pageviews: string, bounce_rate: string, views_per_visit: string, visit_duration: string }>(`
    SELECT
      toString(${bucket}) AS date,
      toString(uniqExact(sess.uid)) AS visitors,
      toString(uniqExact(sess.sid)) AS visits,
      toString(sum(sess.pv)) AS pageviews,
      toString(if(count() = 0, 0, round(countIf(sess.pv = 1) / count() * 100))) AS bounce_rate,
      toString(if(count() = 0, 0, round(sum(sess.pv) / count(), 2))) AS views_per_visit,
      toString(ifNotFinite(avg(sess.dur), 0)) AS visit_duration
    FROM (
      SELECT
        user_id AS uid,
        session_id AS sid,
        min(timestamp) AS mn,
        countIf(name = 'pageview') AS pv,
        greatest(dateDiff('second', min(timestamp), max(timestamp)), 0) AS dur
      FROM events_v2
      WHERE ${w}
      GROUP BY user_id, session_id
    ) AS sess
    GROUP BY date ORDER BY date
  `)
  const filled = fillSeries(daily, range, interval)
  const visits = Number(over?.visits || 0)
  const bounces = Number(over?.bounces || 0)
  const pageviews = Number(over?.pageviews || 0)
  const seriesBy: SeriesBy = {
    visitors: filled.map((p) => ({ date: p.date, value: Number(p.visitors) })),
    visits: filled.map((p) => ({ date: p.date, value: Number(p.visits) })),
    pageviews: filled.map((p) => ({ date: p.date, value: Number(p.pageviews) })),
    bounce_rate: filled.map((p) => ({ date: p.date, value: Number(p.bounce_rate) })),
    views_per_visit: filled.map((p) => ({ date: p.date, value: Number(p.views_per_visit) })),
    visit_duration: filled.map((p) => ({ date: p.date, value: Math.round(Number(p.visit_duration)) })),
  }
  return {
    overview: {
      visitors: Number(over?.visitors || 0),
      pageviews,
      visits,
      bounce_rate: visits ? Math.round((bounces / visits) * 100) : 0,
      views_per_visit: visits ? Math.round((pageviews / visits) * 100) / 100 : 0,
      visit_duration: Math.round(Number(over?.duration || 0)),
    },
    series: seriesBy.visitors,
    seriesBy,
  }
}

export async function siteOverview(siteId: number, range: Range, filter: Filter = {}, interval: Interval = "day") {
  const [live] = await query<{ n: string }>(`
    SELECT toString(uniqExact(user_id)) AS n
    FROM events_v2
    WHERE site_id = ${siteId} AND timestamp >= now() - INTERVAL 5 MINUTE
  `)
  const [current, prev] = await Promise.all([
    overviewOnce(siteId, range, filter, interval),
    overviewOnce(siteId, compareRange(range), filter, interval),
  ])
  return {
    overview: { ...current.overview, live: Number(live?.n || 0) },
    series: current.series,
    seriesBy: current.seriesBy,
    compare: prev.overview,
  }
}

const fields: Record<string, string> = {
  source: "if(referrer_source = '', 'Direct', referrer_source)",
  page: "pathname",
  country: "country_code",
  browser: "browser",
  os: "if(operating_system = '', '(none)', operating_system)",
  device: "screen_size",
  hostname: "hostname",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  channel: "acquisition_channel",
  region: "if(region_name = '', subdivision1_code, region_name)",
  city: "if(city_name = '', toString(city_geoname_id), city_name)",
  title: "if(page_title = '', '(none)', page_title)",
  language: "if(browser_language = '', '(none)', browser_language)",
  screen: "if(screen_resolution = '', '(none)', screen_resolution)",
  query: "if(url_query = '', '(none)', url_query)",
  keyword: "if(search_query = '', '(none)', search_query)",
}

let extraColsReady = false

export async function ensureEventColumns() {
  if (extraColsReady) return
  await ch().command({
    query: `
      CREATE TABLE IF NOT EXISTS events_v2 (
        timestamp DateTime,
        name LowCardinality(String),
        site_id UInt64,
        user_id String,
        session_id String,
        hostname String,
        pathname String,
        referrer String,
        referrer_source LowCardinality(String),
        browser LowCardinality(String),
        browser_version LowCardinality(String),
        operating_system LowCardinality(String),
        operating_system_version LowCardinality(String),
        screen_size LowCardinality(String),
        country_code LowCardinality(String),
        page_title String,
        browser_language LowCardinality(String),
        screen_resolution LowCardinality(String),
        url_query String,
        search_query String,
        utm_source LowCardinality(String),
        utm_medium LowCardinality(String),
        utm_campaign LowCardinality(String),
        acquisition_channel LowCardinality(String),
        region_name String,
        subdivision1_code LowCardinality(String),
        city_name String,
        city_geoname_id UInt32,
        \`meta.key\` Array(String),
        \`meta.value\` Array(String)
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (site_id, timestamp)
    `,
  }).catch(() => undefined)
  const cols = [
    ["page_title", "String DEFAULT ''"],
    ["browser_language", "LowCardinality(String) DEFAULT ''"],
    ["screen_resolution", "LowCardinality(String) DEFAULT ''"],
    ["url_query", "String DEFAULT ''"],
    ["search_query", "String DEFAULT ''"],
  ]
  for (const [name, typ] of cols) {
    await ch().command({ query: `ALTER TABLE events_v2 ADD COLUMN IF NOT EXISTS ${name} ${typ}` })
  }
  extraColsReady = true
}

function safeTz(tz: string) {
  const s = (tz || "Etc/UTC").replace(/[^A-Za-z0-9_+\-\/]/g, "")
  return s || "Etc/UTC"
}

export async function visitHeatmap(siteId: number, range: Range, filter: Filter, timezone: string) {
  const tz = esc(safeTz(timezone))
  const rows = await query<{ dow: string, hour: string, value: string }>(`
    SELECT
      toString(toDayOfWeek(toTimeZone(timestamp, '${tz}'))) AS dow,
      toString(toHour(toTimeZone(timestamp, '${tz}'))) AS hour,
      toString(uniqExact(user_id)) AS value
    FROM events_v2
    WHERE ${where(siteId, range, filter)}
    GROUP BY dow, hour
  `)
  return rows.map((r) => ({ dow: Number(r.dow), hour: Number(r.hour), value: Number(r.value) }))
}

export async function sessionPages(siteId: number, range: Range, which: "entry" | "exit", filter: Filter = {}, limit = 50): Promise<Row[]> {
  const pick = which === "entry" ? "argMin(pathname, timestamp)" : "argMax(pathname, timestamp)"
  const rows = await query<{ name: string, value: string }>(`
    SELECT if(page = '', '(none)', page) AS name, toString(uniqExact(uid)) AS value
    FROM (
      SELECT user_id AS uid, ${pick} AS page
      FROM events_v2
      WHERE ${where(siteId, range, filter)} AND name = 'pageview'
      GROUP BY user_id, session_id
    )
    GROUP BY name ORDER BY toUInt64(value) DESC LIMIT ${limit}
  `)
  return rows.map((r) => ({ name: r.name, value: Number(r.value) }))
}

export async function breakdown(siteId: number, range: Range, field: string, filter: Filter = {}, limit = 50): Promise<Row[]> {
  const expr = fields[field]
  if (!expr) return []
  if (field === "region") {
    const rows = await query<{ name: string, country: string, value: string }>(`
      SELECT
        if(any(region_name) = '', subdivision1_code, any(region_name)) AS name,
        any(country_code) AS country,
        toString(uniqExact(user_id)) AS value
      FROM events_v2
      WHERE ${where(siteId, range, filter)} AND subdivision1_code != ''
      GROUP BY subdivision1_code
      ORDER BY toUInt64(value) DESC
      LIMIT ${limit}
    `)
    return rows.map((r) => ({ name: r.name, value: Number(r.value), code: r.country }))
  }
  if (field === "city") {
    const rows = await query<{ name: string, country: string, value: string }>(`
      SELECT
        if(any(city_name) = '', toString(city_geoname_id), any(city_name)) AS name,
        any(country_code) AS country,
        toString(uniqExact(user_id)) AS value
      FROM events_v2
      WHERE ${where(siteId, range, filter)} AND city_geoname_id != 0
      GROUP BY city_geoname_id
      ORDER BY toUInt64(value) DESC
      LIMIT ${limit}
    `)
    return rows.map((r) => ({ name: r.name, value: Number(r.value), code: r.country }))
  }
  const extra = field === "country"
    ? "AND replaceRegexpAll(country_code, '\\0', '') != ''"
    : field === "title"
      ? "AND page_title != ''"
      : field === "language"
        ? "AND browser_language != ''"
        : field === "screen"
          ? "AND screen_resolution != ''"
          : field === "query"
            ? "AND url_query != ''"
            : field === "keyword"
              ? "AND search_query != ''"
              : ""
  const rows = await query<{ name: string, value: string }>(`
    SELECT if(${expr} = '', '(none)', ${expr}) AS name, toString(uniqExact(user_id)) AS value
    FROM events_v2
    WHERE ${where(siteId, range, filter)}${extra ? ` ${extra}` : ""}
    GROUP BY name ORDER BY toUInt64(value) DESC LIMIT ${limit}
  `)
  return rows.map((r) => ({ name: r.name, value: Number(r.value) }))
}

export type RecentEvent = {
  name: string
  pathname: string
  source: string
  country: string
  browser: string
  os: string
  device: string
  time: string
}

export async function recentEvents(siteId: number, filter: Filter = {}, limit = 16, minutes = 1440): Promise<RecentEvent[]> {
  const rows = await query<RecentEvent>(`
    SELECT
      name,
      pathname,
      if(referrer_source = '', 'Direct', referrer_source) AS source,
      replaceAll(toString(country_code), '\\0', '') AS country,
      browser,
      operating_system AS os,
      screen_size AS device,
      toString(timestamp) AS time
    FROM events_v2
    WHERE site_id = ${siteId}
      AND timestamp >= now() - INTERVAL ${Math.max(1, Math.min(10080, Math.trunc(minutes)))} MINUTE
      ${filter.source ? `AND ${filter.source === "Direct" ? "(referrer_source = '' OR referrer_source = 'Direct')" : `referrer_source = '${esc(filter.source)}'`}` : ""}
      ${filter.page ? `AND pathname = '${esc(filter.page)}'` : ""}
      ${filter.country && filter.country !== "(none)" ? `AND country_code = '${esc(filter.country)}'` : ""}
    ORDER BY timestamp DESC
    LIMIT ${Math.max(1, Math.min(201, Math.trunc(limit)))}
  `)
  return rows
}

export async function liveVisitorsGeo(siteId: number): Promise<Array<{ country: string }>> {
  const rows = await query<{ country: string }>(`
    SELECT replaceRegexpAll(any(country_code), '\\0', '') AS country
    FROM events_v2
    WHERE site_id = ${siteId}
      AND timestamp >= now() - INTERVAL 5 MINUTE
      AND replaceRegexpAll(country_code, '\\0', '') != ''
    GROUP BY user_id
  `)
  return rows.map((r) => ({ country: (r.country || "").trim().toUpperCase() }))
}

export async function livePages(siteId: number): Promise<Row[]> {
  const rows = await query<{ name: string, value: string }>(`
    SELECT if(pathname = '', '/', pathname) AS name, toString(uniqExact(user_id)) AS value
    FROM events_v2
    WHERE site_id = ${siteId} AND timestamp >= now() - INTERVAL 5 MINUTE
    GROUP BY name ORDER BY toUInt64(value) DESC LIMIT 12
  `)
  return rows.map((r) => ({ name: r.name, value: Number(r.value) }))
}

export async function todayTraffic(siteIds: number[]) {
  if (!siteIds.length) return { visitors: 0, visits: 0, pageviews: 0 }
  const ids = siteIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)).join(",")
  if (!ids) return { visitors: 0, visits: 0, pageviews: 0 }
  const [row] = await query<{ visitors: string, visits: string, pageviews: string }>(`
    SELECT
      toString(uniqExact(user_id)) AS visitors,
      toString(uniqExact(session_id)) AS visits,
      toString(countIf(name = 'pageview')) AS pageviews
    FROM events_v2
    WHERE site_id IN (${ids}) AND timestamp >= toStartOfDay(now())
  `)
  return {
    visitors: Number(row?.visitors || 0),
    visits: Number(row?.visits || 0),
    pageviews: Number(row?.pageviews || 0),
  }
}

export type SiteSummary = { visitors: number, live: number, change: number, sparkline: number[] }

export async function siteSummaries(siteIds: number[]) {
  if (!siteIds.length) return new Map<number, SiteSummary>()
  const ids = siteIds.join(",")
  const [day, prev, live, hours] = await Promise.all([
    query<{ site_id: string, n: string }>(`
      SELECT toString(site_id) AS site_id, toString(uniqExact(user_id)) AS n
      FROM events_v2
      WHERE site_id IN (${ids}) AND timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY site_id
    `),
    query<{ site_id: string, n: string }>(`
      SELECT toString(site_id) AS site_id, toString(uniqExact(user_id)) AS n
      FROM events_v2
      WHERE site_id IN (${ids}) AND timestamp >= now() - INTERVAL 48 HOUR AND timestamp < now() - INTERVAL 24 HOUR
      GROUP BY site_id
    `),
    query<{ site_id: string, n: string }>(`
      SELECT toString(site_id) AS site_id, toString(uniqExact(user_id)) AS n
      FROM events_v2
      WHERE site_id IN (${ids}) AND timestamp >= now() - INTERVAL 5 MINUTE
      GROUP BY site_id
    `),
    query<{ site_id: string, hour: string, n: string }>(`
      SELECT toString(site_id) AS site_id, toString(toStartOfHour(timestamp)) AS hour, toString(uniqExact(user_id)) AS n
      FROM events_v2
      WHERE site_id IN (${ids}) AND timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY site_id, hour ORDER BY hour
    `),
  ])
  const out = new Map<number, SiteSummary>()
  for (const id of siteIds) out.set(id, { visitors: 0, live: 0, change: 0, sparkline: Array.from({ length: 24 }, () => 0) })
  const prevMap = new Map<number, number>()
  for (const r of prev) prevMap.set(Number(r.site_id), Number(r.n))
  for (const r of day) {
    const id = Number(r.site_id)
    const visitors = Number(r.n)
    const before = prevMap.get(id) || 0
    const cur = out.get(id) || { visitors: 0, live: 0, change: 0, sparkline: Array.from({ length: 24 }, () => 0) }
    cur.visitors = visitors
    cur.change = before ? Math.round(((visitors - before) / before) * 100) : (visitors ? 100 : 0)
    out.set(id, cur)
  }
  for (const r of live) {
    const id = Number(r.site_id)
    const cur = out.get(id) || { visitors: 0, live: 0, change: 0, sparkline: Array.from({ length: 24 }, () => 0) }
    cur.live = Number(r.n)
    out.set(id, cur)
  }
  const buckets = new Map<number, Map<string, number>>()
  for (const r of hours) {
    const id = Number(r.site_id)
    if (!buckets.has(id)) buckets.set(id, new Map())
    buckets.get(id)!.set(r.hour, Number(r.n))
  }
  const now = new Date()
  now.setMinutes(0, 0, 0)
  for (const id of siteIds) {
    const cur = out.get(id)!
    const byHour = buckets.get(id) || new Map()
    cur.sparkline = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now)
      d.setHours(d.getHours() - (23 - i))
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00:00`
      return byHour.get(key) || byHour.get(key.replace(" ", "T")) || 0
    })
    out.set(id, cur)
  }
  return out
}

export type EventPayload = {
  siteId: number
  name: string
  hostname: string
  pathname: string
  referrer: string
  referrerSource: string
  userId: string
  sessionId: string
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
  country?: string
  title?: string
  language?: string
  screen?: string
  query?: string
  keyword?: string
  utm?: { source?: string, medium?: string, campaign?: string }
  props?: Record<string, string>
}

function toClickHouseRow(ev: EventPayload) {
  const keys = Object.keys(ev.props || {})
  const values = keys.map((k) => ev.props![k])
  return {
    timestamp: Math.floor(Date.now() / 1000),
    name: ev.name || "pageview",
    site_id: ev.siteId,
    user_id: ev.userId,
    session_id: ev.sessionId,
    hostname: ev.hostname,
    pathname: ev.pathname || "/",
    referrer: ev.referrer,
    referrer_source: ev.referrerSource,
    browser: ev.browser || "",
    browser_version: ev.browserVersion || "",
    operating_system: ev.os || "",
    operating_system_version: ev.osVersion || "",
    screen_size: ev.device || "",
    country_code: /^[A-Za-z]{2}$/.test(ev.country || "") ? ev.country!.toUpperCase() : "",
    page_title: (ev.title || "").slice(0, 300),
    browser_language: (ev.language || "").slice(0, 16),
    screen_resolution: (ev.screen || "").slice(0, 32),
    url_query: (ev.query || "").slice(0, 500),
    search_query: (ev.keyword || "").slice(0, 300),
    utm_source: ev.utm?.source || "",
    utm_medium: ev.utm?.medium || "",
    utm_campaign: ev.utm?.campaign || "",
    "meta.key": keys,
    "meta.value": values,
  }
}

type ClickHouseEventRow = ReturnType<typeof toClickHouseRow>

const BATCH_SIZE = 200
const FLUSH_INTERVAL_MS = 1000
const MAX_QUEUE_SIZE = 10000

let eventBuffer: ClickHouseEventRow[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let isFlushing = false

export async function flushEventQueue(): Promise<void> {
  if (isFlushing || eventBuffer.length === 0) return
  isFlushing = true
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const batch = eventBuffer
  eventBuffer = []

  try {
    await ensureEventColumns().catch(() => undefined)
    await ch().insert({
      table: "events_v2",
      format: "JSONEachRow",
      values: batch,
    })
  } catch (err) {
    console.error("[LiteStats] Failed to flush events to ClickHouse:", err)
    if (eventBuffer.length + batch.length < MAX_QUEUE_SIZE) {
      eventBuffer = [...batch, ...eventBuffer]
    }
  } finally {
    isFlushing = false
    if (eventBuffer.length && !flushTimer) flushTimer = setTimeout(() => { flushTimer = null; void flushEventQueue() }, FLUSH_INTERVAL_MS)
  }
}

export function queueEvent(ev: EventPayload): void {
  if (eventBuffer.length >= MAX_QUEUE_SIZE) {
    console.warn("[LiteStats] Event buffer full, dropping event to prevent OOM")
    return
  }
  eventBuffer.push(toClickHouseRow(ev))
  if (eventBuffer.length >= BATCH_SIZE) {
    void flushEventQueue()
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flushEventQueue()
    }, FLUSH_INTERVAL_MS)
  }
}

if (typeof process !== "undefined") {
  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    const deadline = Date.now() + 10_000
    while ((isFlushing || eventBuffer.length) && Date.now() < deadline) {
      if (!isFlushing) await flushEventQueue()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    process.exit(eventBuffer.length || isFlushing ? 1 : 0)
  }
  process.once("SIGINT", () => { void shutdown() })
  process.once("SIGTERM", () => { void shutdown() })
}

export type RecentVisitor = {
  id: string; pathname: string; source: string; country: string; browser: string; os: string;
  device: string; screen: string; language: string; firstSeen: string; lastSeen: string;
  active: boolean; pageviews: number; events: number; pages: string[];
}

/** Anonymous visitors with activity in the last 30 minutes, independent of dashboard filters. */
export async function recentVisitors(siteId: number) {
  const rows = await query<RecentVisitor & { total: string; online: string }>(`
    SELECT toString(user_id) AS id,
      argMax(e.pathname, timestamp) AS pathname,
      argMax(if(referrer_source = '', 'Direct', referrer_source), timestamp) AS source,
      replaceAll(toString(argMax(country_code, timestamp)), '\\0', '') AS country,
      argMax(trim(concat(e.browser, ' ', browser_version)), timestamp) AS browser,
      argMax(trim(concat(operating_system, ' ', operating_system_version)), timestamp) AS os,
      argMax(screen_size, timestamp) AS device,
      argMax(screen_resolution, timestamp) AS screen,
      argMax(browser_language, timestamp) AS language,
      formatDateTime(min(timestamp), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
      formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen,
      max(timestamp) >= now() - INTERVAL 5 MINUTE AS active,
      toUInt32(countIf(name = 'pageview')) AS pageviews, toUInt32(count()) AS events,
      groupUniqArray(20)(e.pathname) AS pages,
      toString(count() OVER ()) AS total,
      toString(sum(toUInt8(max(timestamp) >= now() - INTERVAL 5 MINUTE)) OVER ()) AS online
    FROM events_v2 AS e
    WHERE site_id = ${siteId} AND timestamp >= now() - INTERVAL 30 MINUTE
    GROUP BY user_id ORDER BY max(timestamp) DESC LIMIT 200
  `)
  return { total: Number(rows[0]?.total || 0), online: Number(rows[0]?.online || 0),
    rows: rows.map(({total: _total, online: _online, ...row}) => ({...row, active: Boolean(row.active)})) }
}
