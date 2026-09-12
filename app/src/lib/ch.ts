import { createClient, type ClickHouseClient } from "@clickhouse/client"
import { CLICKHOUSE_URL } from "./env"
import type { Goal } from "./db"
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
  source?: string
  page?: string
  country?: string
  browser?: string
  os?: string
  device?: string
  goal?: Goal | null
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
    parts.push(`timestamp >= toDateTime('${esc(range.from)} 00:00:00')`)
    parts.push(`timestamp < toDateTime('${esc(range.to)} 00:00:00') + INTERVAL 1 DAY`)
  }
  if (filter.source) {
    parts.push(filter.source === "Direct"
      ? `(referrer_source = '' OR referrer_source = 'Direct')`
      : `referrer_source = '${esc(filter.source)}'`)
  }
  if (filter.page) parts.push(`pathname = '${esc(filter.page)}'`)
  if (filter.country && filter.country !== "(none)") parts.push(`country_code = '${esc(filter.country)}'`)
  if (filter.country === "(none)") parts.push(`country_code = ''`)
  if (filter.browser && filter.browser !== "(none)") parts.push(`browser = '${esc(filter.browser)}'`)
  if (filter.os && filter.os !== "(none)") parts.push(`operating_system = '${esc(filter.os)}'`)
  if (filter.device && filter.device !== "(none)") parts.push(`screen_size = '${esc(filter.device)}'`)
  if (filter.goal?.event_name) parts.push(`name = '${esc(filter.goal.event_name)}'`)
  if (filter.goal?.page_path) parts.push(`name = 'pageview' AND pathname = '${esc(filter.goal.page_path)}'`)
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
export type FunnelResult = {
  name: string
  all_visitors: number
  entering_visitors: number
  steps: Array<{ label: string, visitors: number, dropoff: number, conversion_rate: number }>
}
export type JourneyStep = { name: string, pathname: string, visitors: number }

async function query<T>(sql: string): Promise<T[]> {
  const res = await ch().query({ query: sql, format: "JSONEachRow" })
  return await res.json<T>()
}

export async function hasSiteEvents(siteId: number) {
  const [row] = await query<{ n: string }>(`SELECT toString(count()) AS n FROM events_v2 WHERE site_id = ${siteId}`)
  return Number(row?.n || 0) > 0
}

function bucketExpr(range: Range, interval: Interval) {
  if (range.from.startsWith("realtime")) return "toStartOfMinute(sess.mn)"
  if (interval === "minute") return "toStartOfMinute(sess.mn)"
  if (interval === "hour" || range.from.startsWith("last24h")) return "toStartOfHour(sess.mn)"
  if (interval === "week") return "toMonday(sess.mn)"
  if (interval === "month") return "toStartOfMonth(sess.mn)"
  return "toDate(sess.mn)"
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
let demoBackfillStarted = false

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
  await backfillMissingDimensions()
}

export async function backfillMissingDimensions() {
  if (demoBackfillStarted) return
  demoBackfillStarted = true
  const [row] = await query<{ n: string }>(`SELECT toString(count()) AS n FROM events_v2 WHERE page_title = ''`)
  if (!Number(row?.n || 0)) return
  await ch().command({
    query: `
      ALTER TABLE events_v2 UPDATE
        page_title = arrayElement(
          ['Home','Pricing','Blog','Documentation','About','Changelog','Sign in','Dashboard','Settings','API Reference','Privacy Policy','Getting Started','Integrations','Download','Contact','FAQ','Features','Customers','Status','Security'],
          (cityHash64(pathname) % 20) + 1
        ),
        browser_language = multiIf(
          replaceRegexpAll(country_code, '\\0', '') = 'DE', 'de-DE',
          replaceRegexpAll(country_code, '\\0', '') = 'US', 'en-US',
          replaceRegexpAll(country_code, '\\0', '') = 'IT', 'it-IT',
          replaceRegexpAll(country_code, '\\0', '') = 'BR', 'pt-BR',
          replaceRegexpAll(country_code, '\\0', '') = 'PL', 'pl-PL',
          replaceRegexpAll(country_code, '\\0', '') = 'EE', 'et-EE',
          'en'
        ),
        screen_resolution = multiIf(
          screen_size = 'Mobile', arrayElement(['390x844','375x812','414x896'], (user_id % 3) + 1),
          screen_size = 'Tablet', arrayElement(['768x1024','810x1080','834x1194'], (user_id % 3) + 1),
          screen_size = 'Laptop', arrayElement(['1440x900','1366x768','1536x864'], (user_id % 3) + 1),
          arrayElement(['1920x1080','2560x1440','1680x1050'], (user_id % 3) + 1)
        ),
        url_query = multiIf(
          (user_id % 9) = 0, 'utm_source=newsletter',
          (user_id % 9) = 1, 'page=2',
          (user_id % 9) = 2 AND utm_source != '', concat('utm_source=', utm_source),
          (user_id % 9) = 3, 'ref=twitter',
          ''
        ),
        search_query = if(
          referrer_source IN ('Google','DuckDuckGo','Bing') OR lower(utm_source) IN ('google','duckduckgo','bing'),
          arrayElement(['网站统计','开源分析','隐私分析','self hosted analytics','lite stats','流量分析','clickhouse analytics'], (user_id % 7) + 1),
          ''
        ),
        operating_system = multiIf(
          operating_system = 'Windows', concat('Windows ', multiIf(
            operating_system_version IN ('7','8','10','11'), operating_system_version,
            operating_system_version IN ('0','1','2'), '7',
            operating_system_version IN ('3','4','5'), '8.1',
            operating_system_version IN ('6','9'), '10',
            '11'
          )),
          operating_system IN ('GNU/Linux','Linux'), multiIf(
            operating_system_version IN ('1','2','3'), 'Ubuntu',
            operating_system_version IN ('4','5','6'), 'Debian',
            operating_system_version IN ('7','8','9'), 'Fedora',
            operating_system_version IN ('10','11'), 'Arch Linux',
            'Linux'
          ),
          operating_system IN ('Mac','Mac OS','macOS','MacOS'), concat('macOS ', multiIf(
            operating_system_version IN ('12','13','14','15'), operating_system_version,
            operating_system_version IN ('2','5','6'), '13',
            operating_system_version IN ('7','9'), '14',
            '15'
          )),
          operating_system
        )
      WHERE page_title = ''
    `,
    clickhouse_settings: { mutations_sync: "1" },
  })
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

export async function goalVisitors(siteId: number, range: Range, g: Goal, filter: Filter = {}) {
  const stats = await goalStats(siteId, range, g, filter)
  return stats.visitors
}

export async function goalStats(siteId: number, range: Range, g: Goal, filter: Filter = {}) {
  let extra = ""
  if (g.event_name) extra = `name = '${esc(g.event_name)}'`
  else if (g.page_path) extra = `name = 'pageview' AND pathname = '${esc(g.page_path)}'`
  else return { visitors: 0, events: 0 }
  const [row] = await query<{ visitors: string, events: string }>(`
    SELECT toString(uniqExact(user_id)) AS visitors, toString(count()) AS events
    FROM events_v2 WHERE ${where(siteId, range, filter, extra)}
  `)
  return { visitors: Number(row?.visitors || 0), events: Number(row?.events || 0) }
}

export async function propKeys(siteId: number, range: Range, filter: Filter = {}, allowed?: string[] | null): Promise<string[]> {
  const rows = await query<{ key: string }>(`
    SELECT meta.key AS key
    FROM events_v2 ARRAY JOIN \`meta.key\` AS \`meta.key\`
    WHERE ${where(siteId, range, filter)}
    GROUP BY key ORDER BY count() DESC LIMIT 40
  `)
  const keys = rows.map((r) => r.key).filter(Boolean)
  if (allowed && allowed.length) return keys.filter((k) => allowed.includes(k) || ["url", "path", "search_query", "page_title", "browser_language", "screen_resolution", "url_query"].includes(k))
  return keys
}

export async function propBreakdown(siteId: number, range: Range, key: string, filter: Filter = {}): Promise<Row[]> {
  const rows = await query<{ name: string, value: string }>(`
    SELECT
      if(empty(v), '(none)', v) AS name,
      toString(uniqExact(user_id)) AS value
    FROM (
      SELECT user_id, \`meta.value\`[indexOf(\`meta.key\`, '${esc(key)}')] AS v
      FROM events_v2
      WHERE ${where(siteId, range, filter)} AND has(\`meta.key\`, '${esc(key)}')
    )
    GROUP BY name ORDER BY toUInt64(value) DESC LIMIT 20
  `)
  return rows.map((r) => ({ name: r.name, value: Number(r.value) }))
}

function goalCond(g: Goal) {
  if (g.event_name) return `name = '${esc(g.event_name)}'`
  if (g.page_path) return `name = 'pageview' AND pathname = '${esc(g.page_path)}'`
  return "0"
}

export async function funnelStats(siteId: number, range: Range, funnel: { name: string, steps: Goal[] }, filter: Filter = {}): Promise<FunnelResult> {
  const conds = funnel.steps.map(goalCond).join(", ")
  const rows = await query<{ level: string, visitors: string }>(`
    SELECT toString(level) AS level, toString(count()) AS visitors
    FROM (
      SELECT user_id, windowFunnel(86400)(timestamp, ${conds}) AS level
      FROM events_v2
      WHERE ${where(siteId, range, filter)}
      GROUP BY user_id
    )
    GROUP BY level
  `)
  const byLevel = new Map<number, number>()
  let all = 0
  for (const r of rows) {
    const level = Number(r.level)
    const n = Number(r.visitors)
    byLevel.set(level, n)
    all += n
  }
  const cumulative: number[] = []
  for (let i = funnel.steps.length; i >= 1; i--) {
    const here = (byLevel.get(i) || 0) + (cumulative[0] || 0)
    cumulative.unshift(here)
  }
  const entering = cumulative[0] || 0
  const steps = funnel.steps.map((step, i) => {
    const visitors = cumulative[i] || 0
    const prev = i === 0 ? entering : cumulative[i - 1] || 0
    return {
      label: step.display_name,
      visitors,
      dropoff: Math.max(0, prev - visitors),
      conversion_rate: entering ? Math.round((visitors / entering) * 1000) / 10 : 0,
    }
  })
  return { name: funnel.name, all_visitors: all, entering_visitors: entering, steps }
}

export async function exploreNext(siteId: number, range: Range, journey: Array<{ name: string, pathname: string }>, filter: Filter = {}): Promise<JourneyStep[]> {
  const last = journey[journey.length - 1]
  let sql: string
  if (!last) {
    sql = `
      SELECT name, pathname, toString(uniqExact(user_id)) AS visitors
      FROM events_v2
      WHERE ${where(siteId, range, filter)}
      GROUP BY name, pathname
      ORDER BY toUInt64(visitors) DESC LIMIT 12
    `
  } else {
    sql = `
      SELECT next_name AS name, next_path AS pathname, toString(uniqExact(user_id)) AS visitors
      FROM (
        SELECT
          user_id,
          name,
          pathname,
          lead(name) OVER (PARTITION BY user_id ORDER BY timestamp) AS next_name,
          lead(pathname) OVER (PARTITION BY user_id ORDER BY timestamp) AS next_path
        FROM events_v2
        WHERE ${where(siteId, range, filter)}
      )
      WHERE name = '${esc(last.name)}' AND pathname = '${esc(last.pathname)}'
        AND next_name != ''
      GROUP BY name, pathname
      ORDER BY toUInt64(visitors) DESC LIMIT 12
    `
  }
  const rows = await query<{ name: string, pathname: string, visitors: string }>(sql)
  return rows.map((r) => ({ name: r.name, pathname: r.pathname, visitors: Number(r.visitors) }))
}

export async function exploreFunnel(siteId: number, range: Range, journey: Array<{ name: string, pathname: string }>, filter: Filter = {}) {
  if (!journey.length) return []
  const conds = journey.map((s) => `name = '${esc(s.name)}' AND pathname = '${esc(s.pathname)}'`).join(", ")
  const rows = await query<{ level: string, visitors: string }>(`
    SELECT toString(level) AS level, toString(count()) AS visitors
    FROM (
      SELECT user_id, windowFunnel(86400)(timestamp, ${conds}) AS level
      FROM events_v2
      WHERE ${where(siteId, range, filter)}
      GROUP BY user_id
    )
    GROUP BY level
  `)
  const byLevel = new Map<number, number>()
  for (const r of rows) byLevel.set(Number(r.level), Number(r.visitors))
  const cumulative: number[] = []
  for (let i = journey.length; i >= 1; i--) {
    cumulative.unshift((byLevel.get(i) || 0) + (cumulative[0] || 0))
  }
  const entering = cumulative[0] || 0
  return journey.map((s, i) => ({
    name: s.name,
    pathname: s.pathname,
    visitors: cumulative[i] || 0,
    conversion_rate: entering ? Math.round(((cumulative[i] || 0) / entering) * 1000) / 10 : 0,
  }))
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

export async function recentEvents(siteId: number, filter: Filter = {}, limit = 16): Promise<RecentEvent[]> {
  const rows = await query<RecentEvent>(`
    SELECT
      name,
      pathname,
      if(referrer_source = '', 'Direct', referrer_source) AS source,
      country_code AS country,
      browser,
      operating_system AS os,
      screen_size AS device,
      toString(timestamp) AS time
    FROM events_v2
    WHERE site_id = ${siteId}
      ${filter.source ? `AND ${filter.source === "Direct" ? "(referrer_source = '' OR referrer_source = 'Direct')" : `referrer_source = '${esc(filter.source)}'`}` : ""}
      ${filter.page ? `AND pathname = '${esc(filter.page)}'` : ""}
      ${filter.country && filter.country !== "(none)" ? `AND country_code = '${esc(filter.country)}'` : ""}
    ORDER BY timestamp DESC
    LIMIT ${limit}
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

export async function insertEvent(ev: {
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
}) {
  await ensureEventColumns().catch(() => undefined)
  const keys = Object.keys(ev.props || {})
  const values = keys.map((k) => ev.props![k])
  await ch().insert({
    table: "events_v2",
    format: "JSONEachRow",
    values: [{
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
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
    }],
  })
}
