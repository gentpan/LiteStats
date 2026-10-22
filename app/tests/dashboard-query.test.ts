import { expect, spyOn, test } from "bun:test"
import { ch, siteOverview, visitHeatmap } from "../src/lib/ch"

test("comparison metrics do not query or fill an unused comparison trend", async () => {
  const queries: string[] = []
  const client = ch()
  const query = spyOn(client, "query").mockImplementation(async input => {
    queries.push(input.query)
    const rows = input.query.includes("GROUP BY date")
      ? input.query.includes("sess.mn")
        ? [{date: "2026-10-19", visits: "10", bounce_rate: "50", views_per_visit: "1.2", visit_duration: "3"}]
        : [{date: "2026-10-19", visitors: "9", pageviews: "12"}]
      : input.query.includes("sess.uid")
        ? [{visitors: "9", visits: "10", pageviews: "12", bounces: "5", duration: "3"}]
        : [{n: "2"}]
    return {json: async () => rows} as Awaited<ReturnType<typeof client.query>>
  })
  try {
    const result = await siteOverview(1, {from: "2026-10-21", to: "2026-10-28", timezone: "UTC"}, {}, "week")
    expect(queries).toHaveLength(5)
    expect(queries.filter(sql => sql.includes("GROUP BY date"))).toHaveLength(2)
    expect(queries.filter(sql => sql.includes("GROUP BY date")).every(sql => sql.includes("2026-10-21 00:00:00"))).toBe(true)
    expect(result.overview.visitors).toBe(9)
    expect(result.overview.live).toBe(2)
    expect(result.compare.visitors).toBe(9)
    expect(result.series[0]).toEqual({date: "2026-10-19", value: 9})
  } finally {
    query.mockRestore()
    await client.close()
  }
})

test("activity crosses hourly buckets without moving pageviews or creating a second session", async () => {
  const events = [
    {timestamp: "2026-10-21 10:59:00", user: "visitor-a", session: "session-a", name: "pageview"},
    {timestamp: "2026-10-21 11:01:00", user: "visitor-a", session: "session-a", name: "pageview"},
  ]
  const buckets = new Map<string, typeof events>()
  for (const event of events) {
    const date = `${event.timestamp.slice(0, 13)}:00:00`
    buckets.set(date, [...(buckets.get(date) || []), event])
  }
  const activity = [...buckets].map(([date, rows]) => ({
    date, visitors: String(new Set(rows.map(row => row.user)).size), pageviews: String(rows.filter(row => row.name === "pageview").length),
  }))
  const queries: string[] = []
  const client = ch()
  const query = spyOn(client, "query").mockImplementation(async input => {
    const sql = input.query
    queries.push(sql)
    let rows: unknown[]
    if (sql.includes("GROUP BY date")) {
      if (sql.includes("sess.mn")) {
        expect(sql).toContain("toStartOfHour(toTimeZone(sess.mn, 'UTC'))")
        expect(sql).toContain("GROUP BY user_id, session_id")
        rows = [{date: activity[0].date, visits: "1", bounce_rate: "0", views_per_visit: "2", visit_duration: "120"}]
      } else {
        expect(sql).toContain("toStartOfHour(toTimeZone(timestamp, 'UTC'))")
        expect(sql).toContain("uniqExact(user_id)")
        expect(sql).toContain("countIf(name = 'pageview')")
        expect(sql).not.toContain("GROUP BY user_id, session_id")
        rows = activity
      }
    } else if (sql.includes("sess.uid")) {
      rows = [{visitors: "1", visits: "1", pageviews: "2", bounces: "0", duration: "120"}]
    } else rows = [{n: "1"}]
    return {json: async () => rows} as Awaited<ReturnType<typeof client.query>>
  })
  try {
    const result = await siteOverview(1, {from: "2026-10-21", to: "2026-10-21", timezone: "UTC"}, {}, "hour")
    expect(queries).toHaveLength(5)
    expect(queries.filter(sql => sql.includes("GROUP BY date"))).toHaveLength(2)
    const values = (metric: keyof typeof result.seriesBy) => result.seriesBy[metric].filter(point => / (10|11):00:00$/.test(point.date)).map(point => point.value)
    expect(values("visitors")).toEqual([1, 1])
    expect(values("pageviews")).toEqual([1, 1])
    expect(values("visits")).toEqual([1, 0])
    expect(values("bounce_rate")).toEqual([0, 0])
    expect(values("views_per_visit")).toEqual([2, 0])
    expect(values("visit_duration")).toEqual([120, 0])
    expect(result.overview).toEqual({visitors: 1, pageviews: 2, visits: 1, bounce_rate: 0, views_per_visit: 2, visit_duration: 120, live: 1})
    expect(result.series).toEqual(result.seriesBy.visitors)
    expect(result.seriesBy.pageviews.reduce((total, point) => total + point.value, 0)).toBe(2)
  } finally {
    query.mockRestore()
    await client.close()
  }
})

test("legacy invalid timezones use UTC for query bounds, trend buckets and heatmaps", async () => {
  const queries: string[] = []
  const client = ch()
  const query = spyOn(client, "query").mockImplementation(async input => {
    queries.push(input.query)
    return {json: async () => []} as unknown as Awaited<ReturnType<typeof client.query>>
  })
  try {
    const range = {from: "2026-10-21", to: "2026-10-21", timezone: "Invalid/Zone"}
    await siteOverview(1, range, {}, "day")
    await visitHeatmap(1, range, {}, range.timezone)
    expect(queries.every(sql => !sql.includes("Invalid/Zone"))).toBe(true)
    expect(queries.some(sql => sql.includes("toDateTime('2026-10-21 00:00:00', 'UTC')"))).toBe(true)
    expect(queries.some(sql => sql.includes("toTimeZone(sess.mn, 'UTC')"))).toBe(true)
    expect(queries.some(sql => sql.includes("toTimeZone(timestamp, 'UTC')"))).toBe(true)
  } finally {
    query.mockRestore()
    await client.close()
  }
})
