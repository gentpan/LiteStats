import { expect, test } from "bun:test"
import { inspectDomain, rdapRegistration, whoGaRegistration } from "../src/lib/site-check-probe"
import { expiryRefreshDue, mergeExpiry } from "../src/lib/site-check-cache"
import { expiryState } from "../src/lib/site-check-view"

type Lookup = NonNullable<Parameters<typeof inspectDomain>[1]>
function fixture(overrides: Partial<Lookup> = {}) {
  const calls: string[] = []
  const lookup: Lookup = {
    bootstrap: async () => ({services: []}),
    fetch: async () => {throw new Error("Unexpected RDAP request")},
    whois: async (domain, signal) => {
      expect(signal.aborted).toBe(false)
      calls.push(domain)
      return {expiresAt: "2030-12-04", error: null}
    },
    ...overrides,
  }
  return {lookup, calls}
}

test(".cn fallback queries the registered domain, including .com.cn and IDN", async () => {
  const {lookup, calls} = fixture()
  for (const [host, domain] of [["www.cnnic.cn", "cnnic.cn"], ["news.SINA.com.cn", "sina.com.cn"], ["www.例子.cn", "xn--fsqu00a.cn"]]) {
    expect(await inspectDomain(host, lookup)).toEqual({domain, expiresAt: "2030-12-04", error: null})
  }
  expect(calls).toEqual(["cnnic.cn", "sina.com.cn", "xn--fsqu00a.cn"])
})

test("RDAP remains preferred whenever it supplies expiry; other suffixes never use CNNIC", async () => {
  const {lookup, calls} = fixture({
    bootstrap: async () => ({services: [[["cn", "net", "org"], ["https://registry.example/rdap/"]]]}),
    fetch: async url => {
      expect(url.href).toMatch(/^https:\/\/registry.example\/rdap\/domain\//)
      return {status: 200, location: null, url: url.href, body: JSON.stringify({events: [{eventAction: "expiration", eventDate: "2031-01-01T12:00:00Z"}]})}
    },
  })
  for (const domain of ["cnnic.cn", "sina.com.cn", "php.net", "wikipedia.org"]) {
    expect((await inspectDomain(domain, lookup)).expiresAt).toBe("2031-01-01T12:00:00.000Z")
  }
  expect(calls).toEqual([])
  const absent = fixture()
  for (const domain of ["example.com", "example.net", "example.org", "example.cn.com", "localhost", "127.0.0.1"]) {
    expect((await inspectDomain(domain, absent.lookup)).expiresAt).toBeNull()
  }
  expect(absent.calls).toEqual([])
})

test("RDAP and who.ga expose registration metadata without inventing missing values", () => {
  const rdap = {
    events: [{eventAction: "registration", eventDate: "2020-05-01T08:00:00Z"}],
    entities: [{roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Example Registrar"]]]}],
  }
  expect(rdapRegistration(rdap)).toEqual({registeredAt: "2020-05-01T08:00:00.000Z", registrar: "Example Registrar"})
  expect(rdapRegistration(null)).toEqual({registeredAt: null, registrar: null})
  expect(whoGaRegistration({registeredAt: "2020-05-01T08:00:00Z", registrar: "Backup Registrar"})).toEqual({registeredAt: "2020-05-01T08:00:00.000Z", registrar: "Backup Registrar"})
})

test("who.ga supplies expiry when RDAP is unavailable or has no expiration", async () => {
  const {lookup, calls} = fixture({
    fetch: async url => {
      expect(url.href).toBe("https://api.who.ga/example.com")
      return {status: 200, location: null, url: url.href, body: JSON.stringify({domain: "example.com", expiresAt: "2027-08-13T04:00:00.000Z"})}
    },
  })
  expect(await inspectDomain("example.com", lookup)).toEqual({domain: "example.com", expiresAt: "2027-08-13T04:00:00.000Z", registeredAt: null, registrar: null, error: null, retryable: false})
  expect(calls).toEqual([])
})

test("CNNIC fallback covers bootstrap failures, RDAP errors, invalid responses and missing dates", async () => {
  const scenarios: Partial<Lookup>[] = [
    {bootstrap: async () => {throw new Error("Network unavailable")}},
    {fetch: async () => {throw new Error("RDAP unavailable")}},
    {fetch: async url => ({status: 503, location: null, url: url.href, body: ""})},
    {fetch: async url => ({status: 200, location: null, url: url.href, body: "invalid JSON"})},
    {fetch: async url => ({status: 200, location: null, url: url.href, body: JSON.stringify({events: [{eventAction: "registration", eventDate: "2000-01-01T00:00:00Z"}]})})},
  ]
  for (const scenario of scenarios) {
    const {lookup, calls} = fixture({bootstrap: async () => ({services: [[["cn", "net"], ["https://registry.example/"]]]}), ...scenario})
    expect((await inspectDomain("sina.com.cn", lookup)).expiresAt).toBe("2030-12-04")
    expect(calls).toEqual(["sina.com.cn"])
    expect((await inspectDomain("php.net", lookup)).expiresAt).toBeNull()
    expect(calls).toEqual(["sina.com.cn"])
  }
})

test("WHOIS failures retain clear messages and retry policy; refresh preserves the last good date", async () => {
  const checkedAt = "2026-10-22T12:00:00Z"
  for (const retryable of [true, false]) {
    const error = retryable ? "WHOIS 查询超时，请稍后重试或到注册商查看" : "WHOIS 未返回该域名的到期时间，请到注册商查看"
    const {lookup} = fixture({whois: async () => ({expiresAt: null, error, retryable})})
    const domain = await inspectDomain("cnnic.cn", lookup)
    expect(domain).toEqual({domain: "cnnic.cn", expiresAt: null, error, retryable})
    const current = {checkedAt, domain, certificate: {expiresAt: "2027-01-01T00:00:00Z", valid: true, error: null}}
    const previous = {...current, checkedAt: "2026-10-20T12:00:00Z", domain: {...domain, expiresAt: "2028-03-10", error: null}}
    const merged = mergeExpiry(previous, current)
    expect(merged.domain).toMatchObject({expiresAt: "2028-03-10", stale: true, error})
    expect(expiryRefreshDue(merged, Date.parse(checkedAt) + 15 * 60_000)).toBe(retryable)
  }
})

test("unzoned registry dates have day precision and do not expire at an invented instant", () => {
  expect(expiryState("2026-10-23", "2026-10-22T00:00:01Z")).toEqual({days: 1, tone: "warning"})
  expect(expiryState("2026-10-23", "2026-10-22T23:59:59Z")).toEqual({days: 1, tone: "warning"})
  expect(expiryState("2026-10-22", "2026-10-22T23:59:59Z")).toEqual({days: 0, tone: "warning"})
  expect(expiryState("2026-10-21", "2026-10-22T00:00:00Z")).toEqual({days: 0, tone: "bad"})
  expect(expiryState("2026-02-30", "2026-10-22T00:00:00Z")).toEqual({days: null, tone: "unknown"})
  expect(expiryState("2027-01-01", "invalid")).toEqual({days: null, tone: "unknown"})
})
