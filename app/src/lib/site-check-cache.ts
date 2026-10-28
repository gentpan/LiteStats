import type { ExpirySnapshot } from "./site-check-probe"

/** Successful queries live for a day; transient failures get another try in 15 minutes. */
export function expiryRefreshDue(snapshot: ExpirySnapshot | null, now = Date.now()) {
  if (!snapshot) return true
  const failed = (snapshot.domain.error && snapshot.domain.retryable !== false) || snapshot.certificate.error
  const checked = Date.parse(snapshot.checkedAt)
  return !Number.isFinite(checked) || now >= checked + (failed ? 15 * 60_000 : 86400_000)
}

/** Keep each last observed date independently, while retaining the latest error. */
export function mergeExpiry(previous: ExpirySnapshot | null, current: ExpirySnapshot): ExpirySnapshot {
  function merge<T extends ExpirySnapshot["domain"] | ExpirySnapshot["certificate"]>(old: T | undefined, next: T): T {
    const oldMetadata = old as {registeredAt?: string | null; registrar?: string | null; validation?: "DV" | "OV" | "EV" | null} | undefined
    const following = next as {registeredAt?: string | null; registrar?: string | null; validation?: "DV" | "OV" | "EV" | null}
    const retained: typeof following = {}
    if (following.registeredAt == null && oldMetadata?.registeredAt != null) retained.registeredAt = oldMetadata.registeredAt
    if (following.registrar == null && oldMetadata?.registrar != null) retained.registrar = oldMetadata.registrar
    if (following.validation == null && oldMetadata?.validation != null) retained.validation = oldMetadata.validation
    const merged = {...next, ...retained}
    if (next.expiresAt) return {...merged, stale: false, lastSuccessAt: current.checkedAt}
    if (next.error && old?.expiresAt) {
      return {...merged, expiresAt: old.expiresAt, stale: true, lastSuccessAt: old.lastSuccessAt || previous!.checkedAt}
    }
    return merged
  }
  return {...current, domain: merge(previous?.domain, current.domain), certificate: merge(previous?.certificate, current.certificate)}
}
