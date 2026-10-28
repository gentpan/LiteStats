import { expect, test } from "bun:test"
import { fillSeries, type MetricRow } from "../src/lib/series"

const row = (date: string, visitors: string): MetricRow => ({
  date, visitors, session_visitors: visitors, visits: visitors, pageviews: visitors, bounce_rate: "0", views_per_visit: "1", visit_duration: "3",
})

test("weekly series retain partial first and last weeks and fill missing Mondays", () => {
  const first = row("2026-08-31", "9"), last = row("2026-09-28", "17")
  const result = fillSeries([first, last], {from: "2026-09-02", to: "2026-09-29"}, "week")
  expect(result.map(point => [point.date, point.visitors])).toEqual([
    ["2026-08-31", "9"], ["2026-09-07", "0"], ["2026-09-14", "0"], ["2026-09-21", "0"], ["2026-09-28", "17"],
  ])
  expect(result[0]).toBe(first)
  expect(result.at(-1)).toBe(last)
})

test("monthly series align to the first day across year and month-end boundaries", () => {
  const result = fillSeries([row("2025-12-01", "9"), row("2026-02-01", "17")], {from: "2025-12-31", to: "2026-03-10"}, "month")
  expect(result.map(point => [point.date, point.visitors])).toEqual([
    ["2025-12-01", "9"], ["2026-01-01", "0"], ["2026-02-01", "17"], ["2026-03-01", "0"],
  ])
})

test("daily and hourly labels remain calendar labels across host daylight saving changes", () => {
  expect(fillSeries([], {from: "2026-03-07", to: "2026-03-09"}, "day").map(point => point.date)).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"])
  const rows = fillSeries([row("2026-03-08 03:00:00", "12")], {from: "2026-03-08", to: "2026-03-08"}, "hour")
  expect(rows).toHaveLength(24)
  expect(rows[2].date).toBe("2026-03-08 02:00:00")
  expect(rows[3].visitors).toBe("12")
  expect(fillSeries([], {from: "2026-10-21", to: "2026-10-21"}, "minute")).toHaveLength(1440)
})

test("rolling realtime ranges preserve their returned buckets", () => {
  const rows = [row("2026-10-21 12:34:00", "3")]
  expect(fillSeries(rows, {from: "realtime", to: "realtime"}, "minute")).toBe(rows)
  expect(fillSeries(rows, {from: "last24h", to: "last24h"}, "hour")).toBe(rows)
})
