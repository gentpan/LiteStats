import { expect, test } from "bun:test"
import { expiryRefreshDue, mergeExpiry } from "../src/lib/site-check-cache"
import type { ExpirySnapshot } from "../src/lib/site-check-probe"

const good: ExpirySnapshot = {
  checkedAt: "2026-10-20T12:00:00Z",
  domain: {domain: "example.com", expiresAt: "2027-12-01T00:00:00Z", error: null},
  certificate: {expiresAt: "2027-01-01T00:00:00Z", valid: true, error: null},
}
const failed: ExpirySnapshot = {
  checkedAt: "2026-10-22T12:00:00Z",
  domain: {domain: "example.com", expiresAt: null, error: "检查超时"},
  certificate: {expiresAt: null, valid: false, error: "检查超时"},
}

test("failed expiry refreshes retain each previous date without claiming certificate validity", () => {
  const cached = mergeExpiry(good, failed)
  expect(cached.domain).toMatchObject({expiresAt: good.domain.expiresAt, stale: true, lastSuccessAt: good.checkedAt, error: "检查超时"})
  expect(cached.certificate).toMatchObject({expiresAt: good.certificate.expiresAt, valid: false, stale: true, lastSuccessAt: good.checkedAt, error: "检查超时"})
  const again = mergeExpiry(cached, {...failed, checkedAt: "2026-10-22T12:15:00Z"})
  expect(again.certificate.lastSuccessAt).toBe(good.checkedAt)
  expect(again.domain.lastSuccessAt).toBe(good.checkedAt)
  expect(good.certificate.valid).toBe(true)
  expect(mergeExpiry(null, failed).certificate.expiresAt).toBeNull()
})

test("one recovered result does not hide failure in the other; observed bad certificates replace old dates", () => {
  const cached = mergeExpiry(good, failed)
  const partial = mergeExpiry(cached, {...failed, domain: good.domain})
  expect(partial.domain).toMatchObject({stale: false, error: null, lastSuccessAt: failed.checkedAt})
  expect(partial.certificate).toMatchObject({stale: true, lastSuccessAt: good.checkedAt})
  const expired = mergeExpiry(cached, {...failed, certificate: {expiresAt: "2026-10-21T00:00:00Z", valid: false, error: "证书已过期"}})
  expect(expired.certificate).toMatchObject({expiresAt: "2026-10-21T00:00:00Z", valid: false, error: "证书已过期", stale: false})
  const recovered = mergeExpiry(cached, {...good, checkedAt: failed.checkedAt})
  expect(recovered.certificate).toMatchObject({valid: true, stale: false, error: null, lastSuccessAt: failed.checkedAt})
})

test("transient failures retry after 15 minutes, successes and unavailable public data after a day", () => {
  const now = Date.parse(failed.checkedAt)
  const cached = mergeExpiry(good, failed)
  expect(expiryRefreshDue(cached, now + 15 * 60_000 - 1)).toBe(false)
  expect(expiryRefreshDue(cached, now + 15 * 60_000)).toBe(true)
  expect(expiryRefreshDue(failed, now + 15 * 60_000)).toBe(true)
  const fresh = {...good, checkedAt: failed.checkedAt}
  expect(expiryRefreshDue(fresh, now + 86400_000 - 1)).toBe(false)
  expect(expiryRefreshDue(fresh, now + 86400_000)).toBe(true)
  const unavailable = {...fresh, domain: {...failed.domain, retryable: false}}
  expect(expiryRefreshDue(unavailable, now + 15 * 60_000)).toBe(false)
  expect(expiryRefreshDue(unavailable, now + 86400_000)).toBe(true)
  expect(expiryRefreshDue(null, now)).toBe(true)
  expect(expiryRefreshDue({...fresh, checkedAt: "invalid"}, now)).toBe(true)
})
