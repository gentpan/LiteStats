import type { Interval, Range } from "./range"
import { isDateRange } from "./date-time"

export type MetricRow = {
  date: string
  visitors: string
  session_visitors: string
  visits: string
  pageviews: string
  bounce_rate: string
  views_per_visit: string
  visit_duration: string
}

function bucketStart(date: string, interval: Interval) {
  const value = new Date(`${date}T00:00:00Z`)
  if (interval === "week") value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7)
  if (interval === "month") value.setUTCDate(1)
  return value
}

/** Calendar labels belong to the site's timezone; use UTC arithmetic to avoid host DST. */
export function fillSeries(rows: MetricRow[], range: Range, interval: Interval): MetricRow[] {
  if (!isDateRange(range.from, range.to)) return rows
  const cursor = bucketStart(range.from, interval)
  const end = bucketStart(range.to, interval)
  const timed = interval === "minute" || interval === "hour"
  if (timed) end.setUTCHours(23, interval === "minute" ? 59 : 0)
  const keyLength = timed ? 16 : 10
  const byDate = new Map(rows.map(row => [row.date.slice(0, keyLength), row]))
  const out: MetricRow[] = []
  while (cursor <= end && out.length < 4000) {
    const date = cursor.toISOString().slice(0, timed ? 19 : 10).replace("T", " ")
    out.push(byDate.get(date.slice(0, keyLength)) || {
      date, visitors: "0", session_visitors: "0", visits: "0", pageviews: "0", bounce_rate: "0", views_per_visit: "0", visit_duration: "0",
    })
    if (interval === "minute") cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
    else if (interval === "hour") cursor.setUTCHours(cursor.getUTCHours() + 1)
    else if (interval === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else cursor.setUTCDate(cursor.getUTCDate() + (interval === "week" ? 7 : 1))
  }
  return out.length ? out : rows
}
