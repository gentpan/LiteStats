import { expect, test } from "bun:test"
import { isPublicAddress, publicUrl, publicAddresses, followPublic, certificateValidationFromPolicies } from "../src/lib/site-check-network"
import { rdapExpiry, siteCheckUrl, type HttpCheck } from "../src/lib/site-check-probe"
import { checkSummary, expiryState, responseSegments } from "../src/lib/site-check-view"

const signal = () => AbortSignal.timeout(1000)

test("site checks reject private, metadata, loopback, mapped and reserved addresses", async () => {
  for (const ip of ["127.0.0.1", "0.0.0.0", "10.1.1.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "192.0.2.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1", "64:ff9b::a00:1", "2002:7f00:1::"]) expect(isPublicAddress(ip)).toBe(false)
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPublicAddress(ip)).toBe(true)
  for (const url of ["http://127.1", "http://2130706433", "http://0x7f000001", "http://[::ffff:127.0.0.1]", "http://localhost", "http://a.local", "https://name:secret@example.com", "file:///etc/passwd", "https://example.com:444/"]) expect(() => publicUrl(url)).toThrow()
  const resolver = (async () => [{address: "8.8.8.8", family: 4}, {address: "127.0.0.1", family: 4}]) as unknown as Parameters<typeof publicAddresses>[2]
  await expect(publicAddresses("example.com", signal(), resolver)).rejects.toThrow("公网地址")
  const publicResolver = (async () => [{address: "8.8.8.8", family: 4}]) as unknown as Parameters<typeof publicAddresses>[2]
  expect(await publicAddresses("example.com", signal(), publicResolver)).toEqual([{address: "8.8.8.8", family: 4}])
})

test("redirects have per-hop address checks, a cap and no HTTPS downgrade", async () => {
  let calls = 0
  const target = new URL("https://example.com/")
  const blocked = async () => {calls++; return {status: 302, location: "http://169.254.169.254/latest/meta-data/", body: ""}}
  await expect(followPublic(target, signal(), 0, blocked)).rejects.toThrow()
  expect(calls).toBe(1)
  await expect(followPublic(target, signal(), 0, async () => ({status: 301, location: "http://example.com/", body: ""}))).rejects.toThrow("不安全")
  calls = 0
  await expect(followPublic(target, signal(), 0, async () => {calls++; return {status: 302, location: "/again", body: ""}})).rejects.toThrow("跳转次数")
  expect(calls).toBe(4)
  const result = await followPublic(target, signal(), 0, async url => url.pathname === "/" ? {status: 301, location: "/home", body: ""} : {status: 200, location: null, body: ""})
  expect(result.status).toBe(200)
  expect(result.url).toBe("https://example.com/home")
})

test("check paths stay on the selected site and RDAP uses expiration events only", () => {
  for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", "?a=1", "/#fragment"]) expect(() => siteCheckUrl("example.com", path)).toThrow()
  expect(siteCheckUrl("example.com", "/health?ready=1").href).toBe("https://example.com/health?ready=1")
  expect(rdapExpiry({events: [{eventAction: "registration", eventDate: "2000-01-01T00:00:00Z"}, {eventAction: "expiration", eventDate: "2027-03-01T00:00:00Z"}]})).toBe("2027-03-01T00:00:00.000Z")
  expect(rdapExpiry({events: [{eventAction: "last changed", eventDate: "2027-03-01T00:00:00Z"}]})).toBeNull()
  expect(rdapExpiry({events: [{eventAction: "expiration", eventDate: "invalid"}]})).toBeNull()
  expect(rdapExpiry(null)).toBeNull()
})

test("certificate policy OIDs identify validation levels without issuer guesses", () => {
  expect(certificateValidationFromPolicies(["2.23.140.1.2.1"])).toBe("DV")
  expect(certificateValidationFromPolicies(["2.23.140.1.2.2"])).toBe("OV")
  expect(certificateValidationFromPolicies(["2.23.140.1.1"])).toBe("EV")
  expect(certificateValidationFromPolicies(["1.2.3.4"])).toBeNull()
  expect(certificateValidationFromPolicies([])).toBeNull()
})

test("expiry and availability distinguish missing data, expiry, warnings and observed samples", () => {
  const now = "2026-10-22T12:00:00Z"
  expect(expiryState(null, now)).toEqual({days: null, tone: "unknown"})
  expect(expiryState("2026-10-21T12:00:00Z", now)).toEqual({days: 0, tone: "bad"})
  expect(expiryState("2026-11-01T12:00:00Z", now)).toEqual({days: 10, tone: "warning"})
  expect(expiryState("2027-01-01T12:00:00Z", now).tone).toBe("good")
  const empty = checkSummary([], now)
  expect(empty.rate).toBeNull()
  expect(empty.buckets.every(bucket => bucket.tone === "unknown")).toBe(true)
  const checks: HttpCheck[] = [
    {checkedAt: "2026-10-22T11:30:00Z", ok: true, status: 200, durationMs: 100, error: null},
    {checkedAt: "2026-10-22T11:35:00Z", ok: false, status: 500, durationMs: 80, error: "HTTP 500"},
    {checkedAt: "2026-10-22T11:40:00Z", ok: true, status: 200, durationMs: 200, error: null},
    {checkedAt: "2026-10-22T11:59:00Z", ok: true, status: 200, durationMs: 300, error: null},
  ]
  const result = checkSummary(checks, now)
  expect(result.rate).toBe(75)
  expect(result.median).toBe(200)
  expect(checkSummary(checks.slice(0, 3), now).median).toBe(150)
  expect(result.buckets.filter(bucket => bucket.tone === "unknown").length).toBe(46)
  expect(responseSegments(checks).map(segment => segment.length)).toEqual([1, 1, 1])
})
