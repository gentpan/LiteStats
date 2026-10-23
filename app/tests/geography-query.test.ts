import { expect, spyOn, test } from "bun:test"
import { createClient } from "@clickhouse/client"
import { breakdown, ch } from "../src/lib/ch"

const range = { from: "2026-10-01", to: "2026-10-01", timezone: "UTC" }

async function captureBreakdown(field: "city" | "region", rows: {name: string, country: string, value: string}[] = []) {
  const client = ch()
  let sql = ""
  const query = spyOn(client, "query").mockImplementation(async input => {
    sql = input.query
    return { json: async () => rows } as unknown as Awaited<ReturnType<typeof client.query>>
  })
  try {
    const result = await breakdown(17, range, field, {}, 50)
    return { sql, result }
  } finally {
    query.mockRestore()
    await client.close()
  }
}

test("city breakdown includes imported names without GeoNames IDs and preserves country codes", async () => {
  const { sql, result } = await captureBreakdown("city", [
    { name: "Seattle", country: "US", value: "2" },
    { name: "Perth", country: "AU", value: "1" },
    { name: "5809844", country: "US", value: "1" },
  ])
  expect(sql).toContain("AND (city_geoname_id != 0 OR city_name != '')")
  expect(sql).toContain("GROUP BY country_code, if(city_geoname_id != 0,")
  expect(sql).toContain("concat('id:', toString(city_geoname_id))")
  expect(sql).toContain("concat('name:', if(subdivision1_code != '', subdivision1_code, region_name), ':', city_name)")
  expect(sql).toContain("uniqExact(user_id)")
  expect(sql).toContain("site_id = 17")
  expect(result).toEqual([
    { name: "Seattle", code: "US", value: 2 },
    { name: "Perth", code: "AU", value: 1 },
    { name: "5809844", code: "US", value: 1 },
  ])
})

test("region breakdown separates countries sharing a subdivision code and accepts name-only regions", async () => {
  const { sql, result } = await captureBreakdown("region", [
    { name: "Washington", country: "US", value: "2" },
    { name: "Western Australia", country: "AU", value: "1" },
  ])
  expect(sql).toContain("AND (subdivision1_code != '' OR region_name != '')")
  expect(sql).toContain("GROUP BY country_code, if(subdivision1_code != '', subdivision1_code, region_name)")
  expect(result).toEqual([
    { name: "Washington", code: "US", value: 2 },
    { name: "Western Australia", code: "AU", value: 1 },
  ])
})

// Optional read-only integration: the fixture is an inline table, so this needs
// no existing database/table and never inserts or changes stored events.
const clickhouseTestUrl = process.env.LITESTATS_TEST_CLICKHOUSE_URL
test.skipIf(!clickhouseTestUrl)("geography SQL keeps imported cities and country/region boundaries in ClickHouse", async () => {
  const fixture = `values('timestamp DateTime, site_id UInt64, user_id String, country_code String, subdivision1_code String, region_name String, city_name String, city_geoname_id UInt32',
    ('2026-10-01 12:00:00', 17, 'a', 'US', 'WA', 'Washington', 'Seattle', 0),
    ('2026-10-01 12:01:00', 17, 'a', 'US', 'WA', 'Washington', 'Seattle', 0),
    ('2026-10-01 12:00:00', 17, 'b', 'AU', 'WA', 'Western Australia', 'Perth', 0),
    ('2026-10-01 12:00:00', 17, 'c', 'US', 'MA', 'Massachusetts', 'Springfield', 0),
    ('2026-10-01 12:00:00', 17, 'd', 'US', 'IL', 'Illinois', 'Springfield', 0),
    ('2026-10-01 12:00:00', 17, 'e', 'US', 'WA', 'Washington', '', 5809844),
    ('2026-10-01 12:00:00', 17, 'f', 'FR', '', 'Paris region', 'Paris', 0),
    ('2026-10-01 12:00:00', 17, 'g', '', '', '', '', 0),
    ('2026-10-01 12:00:00', 99, 'other-site', 'US', 'WA', 'Washington', 'Seattle', 0),
    ('2026-09-30 12:00:00', 17, 'other-day', 'US', 'WA', 'Washington', 'Seattle', 0))`
  const database = createClient({ url: clickhouseTestUrl! })
  const run = async (field: "city" | "region") => {
    const { sql } = await captureBreakdown(field)
    const response = await database.query({ query: sql.replace("FROM events_v2", `FROM ${fixture}`), format: "JSONEachRow" })
    return response.json<{name: string, country: string, value: string}>()
  }
  try {
    const cities = await run("city")
    expect(cities).toHaveLength(6)
    expect(cities.filter(row => row.name === "Springfield")).toHaveLength(2)
    expect(cities.find(row => row.name === "Seattle")).toEqual({ name: "Seattle", country: "US", value: "1" })
    expect(cities.some(row => row.name === "5809844")).toBe(true)
    expect(cities.some(row => row.name === "Paris")).toBe(true)
    const regions = await run("region")
    expect(regions).toHaveLength(5)
    expect(regions.find(row => row.name === "Washington")).toEqual({ name: "Washington", country: "US", value: "2" })
    expect(regions.find(row => row.name === "Western Australia")).toEqual({ name: "Western Australia", country: "AU", value: "1" })
    expect(regions.some(row => row.name === "Paris region")).toBe(true)
  } finally {
    await database.close()
  }
})
