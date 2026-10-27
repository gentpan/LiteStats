import { expect, spyOn, test } from "bun:test"
import { ch, siteSummaries } from "../src/lib/ch"

type Count = { site_id: string; n: string; visits?: string; pageviews?: string }
type Hour = Count & { hour: string }

async function withSummaries(
  rows: { current?: Count[]; previous?: Count[]; live?: Count[]; hours?: Hour[] },
  run: () => Promise<void>,
) {
  const client = ch()
  // Intercept every request: these tests never connect to ClickHouse or change data.
  const query = spyOn(client, "query").mockImplementation(async input => {
    const data = input.query.includes(" AS hour") ? rows.hours
      : input.query.includes("INTERVAL 48 HOUR") ? rows.previous
        : input.query.includes("INTERVAL 5 MINUTE") ? rows.live : rows.current
    return { json: async () => data || [] } as unknown as Awaited<ReturnType<typeof client.query>>
  })
  try { await run() }
  finally { query.mockRestore(); await client.close() }
}

test("site comparison includes sites whose current traffic dropped to zero", async () => {
  await withSummaries({
    current: [{site_id: "2", n: "20", visits: "24", pageviews: "40"}, {site_id: "4", n: "8", visits: "10", pageviews: "16"}],
    previous: [{site_id: "1", n: "12"}, {site_id: "2", n: "10"}],
    live: [{site_id: "2", n: "3"}],
  }, async () => {
    const result = await siteSummaries([1, 2, 3, 4])
    expect(result.get(1)).toMatchObject({visitors: 0, change: -100, live: 0})
    expect(result.get(2)).toMatchObject({visitors: 20, visits: 24, pageviews: 40, change: 100, live: 3})
    expect(result.get(3)).toMatchObject({visitors: 0, change: 0, live: 0})
    expect(result.get(4)).toMatchObject({visitors: 8, change: 100, live: 0})
  })
})

test("sparkline places absolute hour buckets correctly at both DST transitions", async () => {
  for (const instant of ["2026-03-08T07:15:00Z", "2026-11-01T06:15:00Z"]) {
    const now = Date.parse(instant)
    const hour = Math.floor(now / 3_600_000) * 3600
    const clock = spyOn(Date, "now").mockReturnValue(now)
    try {
      await withSummaries({hours: [
        {site_id: "1", hour: String(hour - 23 * 3600), n: "2"},
        {site_id: "1", hour: String(hour - 3600), n: "5"},
        {site_id: "1", hour: String(hour), n: "7"},
        {site_id: "2", hour: String(hour), n: "11"},
      ]}, async () => {
        const result = await siteSummaries([1, 2])
        expect(result.get(1)?.sparkline).toEqual([2, ...Array(21).fill(0), 5, 7])
        expect(result.get(2)?.sparkline).toEqual([...Array(23).fill(0), 11])
      })
    } finally { clock.mockRestore() }
  }
})

test("a site with no hourly rows still gets a complete empty sparkline", async () => {
  await withSummaries({}, async () => {
    const result = await siteSummaries([1])
    expect(result.get(1)?.sparkline).toEqual(Array(24).fill(0))
  })
})
