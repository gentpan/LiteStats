import { expect, test } from "bun:test"
import { canonicalTimezone, dateInTimezone, isCalendarDate, isDateRange, safeTimezone } from "../src/lib/date-time"
import { compactDashSearch, dashInput, parseDashSearch, parseDate, PERIODS, rangeFromSearch } from "../src/lib/range"
import { dashboardSchema, timezoneSchema } from "../src/lib/validation"
import { timezoneOptions } from "../src/lib/timezones"

test("dates require real calendar days, including Gregorian leap-year rules", () => {
  for (const value of ["2024-02-29", "2000-02-29", "2026-04-30", "2026-12-31"]) {
    expect(isCalendarDate(value)).toBe(true)
    expect(() => parseDate(value)).not.toThrow()
  }
  for (const value of ["2026-02-31", "2026-02-29", "1900-02-29", "2100-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "0000-01-01", "2026-1-01", "2026-01-01T00:00:00Z", "", "today"]) {
    expect(isCalendarDate(value)).toBe(false)
    expect(() => parseDate(value)).toThrow(RangeError)
    expect(dashboardSchema.safeParse({domain: "test", period: "custom", from: value, to: value}).success).toBe(false)
  }
  expect(isDateRange("2024-02-29", "2024-02-29")).toBe(true)
  expect(isDateRange("2026-10-22", "2026-10-21")).toBe(false)
})

test("direct dashboard requests reject incomplete, reversed or mismatched ranges", () => {
  for (const search of [
    {period: "custom"}, {period: "custom", from: "2026-10-21"},
    {period: "custom", to: "2026-10-21"},
    {period: "custom", from: "2026-10-22", to: "2026-10-21"},
    {from: "2026-10-22", to: "2026-10-21"},
    {period: "custom", from: "realtime", to: "realtime"},
    {period: "today", from: "last24h", to: "last24h"},
    {period: "realtime", from: "realtime", to: "2026-10-21"},
    {from: "last24h", to: "realtime"},
  ]) expect(dashboardSchema.safeParse({domain: "test", ...search}).success).toBe(false)
})

test("all dashboard presets, legacy shortcuts, filters and same-day custom ranges remain valid", () => {
  for (const period of PERIODS) {
    const search = parseDashSearch({period, from: "2024-02-29", to: "2024-02-29", country: "CN", source: "Google"})
    expect(search.period).toBe(period)
    expect(dashboardSchema.safeParse(dashInput("test", search)).success).toBe(true)
    expect(parseDashSearch(compactDashSearch(search))).toEqual(search)
  }
  for (const search of [{}, {days: -1}, {days: 30}, {days: 90}, {from: "realtime"}, {from: "last24h", to: "last24h"}, {from: "2024-02-29", to: "2024-02-29"}]) {
    expect(dashboardSchema.safeParse({domain: "test", ...search}).success).toBe(true)
  }
  expect(parseDashSearch({from: "2024-02-29", to: "2024-02-29"}).period).toBe("custom")
})

test("invalid bookmarked custom ranges fall back to seven days without dropping filters", () => {
  for (const from of ["2026-02-31", "2026-10-22", "", "realtime"]) {
    const input: Record<string, unknown> = {period: "custom", from, to: "2026-10-21", country: "CN", tab: "sources"}
    const search = parseDashSearch(input)
    expect(search.period).toBe("7d")
    expect(isDateRange(search.from, search.to)).toBe(true)
    expect(search.country).toBe("CN")
    expect(search.tab).toBe("sources")
    expect(compactDashSearch(input)).toEqual({period: "7d", country: "CN", tab: "sources"})
    expect(dashboardSchema.safeParse(dashInput("test", search)).success).toBe(true)
  }
})

test("timezone writes validate and normalize named zones and retain DST-aware aliases", () => {
  for (const value of ["UTC", "Etc/UTC", "Asia/Shanghai", "America/New_York", "US/Eastern", "Etc/GMT+12", "Asia/Kathmandu"]) {
    expect(timezoneSchema.safeParse(value).success).toBe(true)
    const normalized = timezoneSchema.parse(value)
    expect(dateInTimezone(normalized, new Date("2026-07-01T04:00:00Z"))).toBe(dateInTimezone(value, new Date("2026-07-01T04:00:00Z")))
    for (const instant of ["2026-01-01T04:30:00Z", "2026-07-01T04:30:00Z"]) {
      const now = new Date(instant)
      const previousDayKey = new Intl.DateTimeFormat("en-CA", {timeZone: value, year: "numeric", month: "2-digit", day: "2-digit"}).format(now)
      expect(dateInTimezone(value, now)).toBe(previousDayKey)
    }
  }
  expect(timezoneSchema.parse(" asia/shanghai ")).toBe("Asia/Shanghai")
  for (const value of ["", " ", "Invalid/Zone", "Asia/Shanghai'", "+08:00", "-05", "A".repeat(65)]) {
    expect(timezoneSchema.safeParse(value).success).toBe(false)
    expect(safeTimezone(value)).toBe("UTC")
  }
  for (const option of timezoneOptions("America/New_York")) expect(canonicalTimezone(option.value)).not.toBeNull()
})

test("collector and report dates use the same safe timezone at midnight and DST transitions", () => {
  expect(dateInTimezone("Asia/Shanghai", new Date("2026-10-20T16:00:00Z"))).toBe("2026-10-21")
  expect(dateInTimezone("America/New_York", new Date("2026-03-08T04:59:59Z"))).toBe("2026-03-07")
  expect(dateInTimezone("America/New_York", new Date("2026-03-08T07:00:00Z"))).toBe("2026-03-08")
  expect(dateInTimezone("America/New_York", new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01")
  const expected = dateInTimezone("UTC")
  for (const timezone of ["Invalid/Zone", "", undefined]) {
    expect(rangeFromSearch({period: "today"}, timezone)).toEqual({from: expected, to: expected, timezone: "UTC"})
    expect(dateInTimezone(timezone)).toBe(expected)
  }
})
