export type Range = { from: string, to: string, timezone?: string }

export type Period =
  | "realtime"
  | "today"
  | "yesterday"
  | "24h"
  | "7d"
  | "28d"
  | "91d"
  | "month"
  | "last_month"
  | "year"
  | "12mo"
  | "all"
  | "custom"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function presetRange(days: number, now = new Date()): Range {
  const to = new Date(now)
  const from = new Date(now)
  from.setDate(from.getDate() - (Math.max(1, days) - 1))
  return { from: isoDate(from), to: isoDate(to) }
}

function rangeFromPeriod(period: Period, from?: string, to?: string, now = new Date()): Range {
  if (period === "realtime") return { from: "realtime", to: "realtime" }
  if (period === "24h") return { from: "last24h", to: "last24h" }
  if (period === "today") return { from: isoDate(now), to: isoDate(now) }
  if (period === "yesterday") {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    return { from: isoDate(y), to: isoDate(y) }
  }
  if (period === "7d") return presetRange(7, now)
  if (period === "28d") return presetRange(28, now)
  if (period === "91d") return presetRange(91, now)
  if (period === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) }
  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: isoDate(start), to: isoDate(end) }
  }
  if (period === "year") return { from: isoDate(new Date(now.getFullYear(), 0, 1)), to: isoDate(now) }
  if (period === "12mo") {
    const start = new Date(now)
    start.setFullYear(start.getFullYear() - 1)
    start.setDate(start.getDate() + 1)
    return { from: isoDate(start), to: isoDate(now) }
  }
  if (period === "all") return { from: "2018-01-01", to: isoDate(now) }
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
    return { from, to }
  }
  return presetRange(7, now)
}

export const PERIOD_LABEL: Record<Period, string> = {
  realtime: "实时",
  today: "今天",
  yesterday: "昨天",
  "24h": "近 24 小时",
  "7d": "近 7 天",
  "28d": "近 28 天",
  "91d": "近 91 天",
  month: "本月至今",
  last_month: "上个月",
  year: "今年至今",
  "12mo": "近 12 个月",
  all: "全部时间",
  custom: "自定义范围",
}

export function periodLabel(period: Period, range: Range) {
  if (period === "custom") return `${range.from} – ${range.to}`
  return PERIOD_LABEL[period]
}

export function compareRange(range: Range): Range {
  return { ...previousRange(range), timezone: range.timezone }
}

function previousRange(range: Range): Range {
  if (range.from === "realtime") return { from: "realtime-prev", to: "realtime-prev" }
  if (range.from === "last24h") return { from: "last24h-prev", to: "last24h-prev" }
  const from = parseDate(range.from)
  const to = parseDate(range.to)
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (days - 1))
  return { from: isoDate(prevFrom), to: isoDate(prevTo) }
}

export function rangeFromSearch(s: { period?: string, from?: string, to?: string, days?: number }, timezone?: string): Range {
  const period = (s.period as Period) || inferPeriod(s)
  const now = timezone ? parseDate(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())) : new Date()
  return { ...rangeFromPeriod(period, s.from, s.to, now), timezone }
}

function inferPeriod(s: { from?: string, to?: string, days?: number }): Period {
  if (s.from === "realtime" || s.days === -1) return "realtime"
  if (s.from === "last24h") return "24h"
  if (s.days === 1) return "today"
  if (s.days === 7) return "7d"
  if (s.days === 28) return "28d"
  if (s.days === 30) return "28d"
  if (s.days === 90 || s.days === 91) return "91d"
  if (s.from && s.to && s.from !== s.to) return "custom"
  return "7d"
}

export type Interval = "minute" | "hour" | "day" | "week" | "month"

export const INTERVAL_LABEL: Record<Interval, string> = {
  minute: "分钟",
  hour: "小时",
  day: "天",
  week: "周",
  month: "月",
}

export const INTERVAL_VIEW: Record<Interval, string> = {
  minute: "这一分钟",
  hour: "这一小时",
  day: "当天",
  week: "当周",
  month: "当月",
}

const VALID_INTERVALS: Record<Period, Interval[]> = {
  realtime: ["minute"],
  today: ["minute", "hour"],
  yesterday: ["minute", "hour"],
  "24h": ["minute", "hour"],
  "7d": ["hour", "day"],
  "28d": ["day", "week"],
  "91d": ["day", "week", "month"],
  month: ["day", "week"],
  last_month: ["day", "week"],
  year: ["day", "week", "month"],
  "12mo": ["day", "week", "month"],
  all: ["week", "month"],
  custom: ["day", "week", "month"],
}

export function availableIntervals(period: Period, range: Range): Interval[] {
  if (period === "custom" || period === "all") {
    if (range.from.startsWith("20") && range.to.startsWith("20")) {
      const days = Math.round((parseDate(range.to).getTime() - parseDate(range.from).getTime()) / 86400000)
      if (days < 1) return ["minute", "hour"]
      if (days < 7) return ["hour", "day"]
      if (days < 31) return ["day", "week"]
      if (days < 366) return ["day", "week", "month"]
      return ["week", "month"]
    }
  }
  return VALID_INTERVALS[period]
}

function defaultInterval(period: Period, range: Range): Interval {
  const available = availableIntervals(period, range)
  if (period === "today" || period === "yesterday" || period === "24h") return "hour"
  if (period === "7d") return "day"
  if (period === "year" || period === "12mo") return "month"
  if (period === "all") return available.includes("day") ? "day" : "month"
  if (period === "custom" && range.from.startsWith("20") && range.to.startsWith("20")) {
    const days = Math.round((parseDate(range.to).getTime() - parseDate(range.from).getTime()) / 86400000)
    if (days < 1) return "hour"
    if (days < 30) return "day"
    if (days < 180) return "week"
    return "month"
  }
  return available[0]
}

export function intervalStorageKey(domain: string, period: Period) {
  return `interval__${period}__${domain}`
}

export type DashSearch = {
  period: Period
  days: number
  from: string
  to: string
  interval: Interval
  tab: string
  prop: string
  funnel: number
  source: string
  page: string
  hostname: string
  country: string
  browser: string
  os: string
  device: string
  utm: string
  goal: number
}

const PERIODS: Period[] = ["realtime", "today", "yesterday", "24h", "7d", "28d", "91d", "month", "last_month", "year", "12mo", "all", "custom"]

export function parseDashSearch(s: Record<string, unknown>): DashSearch {
  const raw = String(s.period || "")
  const period: Period = PERIODS.includes(raw as Period) ? raw as Period : inferPeriod({ from: String(s.from || ""), to: String(s.to || ""), days: Number(s.days) })
  const range = rangeFromPeriod(period, String(s.from || ""), String(s.to || ""))
  const available = availableIntervals(period, range)
  const rawInterval = String(s.interval || "") as Interval
  const interval = available.includes(rawInterval) ? rawInterval : defaultInterval(period, range)
  return {
    period,
    days: period === "realtime" ? -1 : period === "7d" ? 7 : 0,
    from: range.from,
    to: range.to,
    interval,
    tab: String(s.tab || "overview"),
    prop: String(s.prop || ""),
    funnel: Number(s.funnel || 0),
    source: String(s.source || ""),
    page: String(s.page || ""),
    hostname: String(s.hostname || ""),
    country: String(s.country || ""),
    browser: String(s.browser || ""),
    os: String(s.os || ""),
    device: String(s.device || ""),
    utm: String(s.utm || ""),
    goal: Number(s.goal || 0),
  }
}

/** URL representation only; loaders still receive the complete validated defaults. */
export function compactDashSearch<T extends Record<string, unknown>>(input: T): T {
  const parsed = parseDashSearch(input)
  const result: Record<string, unknown> = {...input}
  delete result.days
  if (parsed.period === "7d") delete result.period
  else result.period = parsed.period
  if (parsed.period !== "custom") { delete result.from; delete result.to }
  if (parsed.interval === defaultInterval(parsed.period, parsed)) delete result.interval
  if (result.tab === "overview") delete result.tab
  for (const key of ["prop","funnel","source","page","hostname","country","browser","os","device","utm","goal"]) {
    if (result[key] === "" || result[key] === 0 || result[key] == null) delete result[key]
  }
  return result as T
}

export function dashInput(domain: string, s: DashSearch) {
  return {
    domain,
    period: s.period,
    days: s.days,
    from: s.from,
    to: s.to,
    interval: s.interval,
    propKey: s.prop || undefined,
    funnelId: s.funnel || undefined,
    source: s.source || undefined,
    page: s.page || undefined,
    hostname: s.hostname || undefined,
    country: s.country || undefined,
    browser: s.browser || undefined,
    os: s.os || undefined,
    device: s.device || undefined,
    utm: s.utm || undefined,
    goalId: s.goal || undefined,
  }
}

export function delta(now: number, prev?: number | null) {
  if (prev == null) return null
  const diff = now - prev
  const pct = prev ? Math.round((diff / prev) * 100) : (now ? 100 : 0)
  return { diff, pct }
}
