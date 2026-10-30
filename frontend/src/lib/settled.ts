import { useEffect, useState } from "react"

/** A finished load. Rejections become data so a promise handed to the client can never go unhandled. */
export type Settled<T> = { ok: true, value: T } | { ok: false, message: string }

export function settle<T>(work: Promise<T>): Promise<Settled<T>> {
  return work.then<Settled<T>, Settled<T>>(
    value => ({ ok: true, value }),
    error => ({ ok: false, message: error instanceof Error ? error.message : String(error) }),
  )
}

type SettledView<T> = { promise: Promise<Settled<T>> | null, key: string, result: Settled<T> | null }

/** Record a finished load. A failed refresh of the same request keeps the data already on screen. */
export function applySettled<T>(view: SettledView<T>, promise: Promise<Settled<T>>, key: string, result: Settled<T>): SettledView<T> {
  if (!result.ok && view.result?.ok && view.key === key) return { ...view, promise }
  return { promise, key, result }
}

export function describeSettled<T>(view: SettledView<T>, promise: Promise<Settled<T>>, key: string) {
  const pending = view.promise !== promise
  // `switching` means the request itself changed (period, filter), unlike a quiet background refresh.
  return { result: view.result, pending, switching: pending && view.key !== key }
}

/**
 * Follow a loader promise without suspending: the last result stays available while the next one loads,
 * so only the very first load has nothing to show. `key` identifies the request behind the promise.
 */
export function useSettled<T>(promise: Promise<Settled<T>>, key: string) {
  const [view, setView] = useState<SettledView<T>>({ promise: null, key: "", result: null })
  useEffect(() => {
    let current = true
    void promise.then(result => { if (current) setView(previous => applySettled(previous, promise, key, result)) })
    return () => { current = false }
  }, [promise, key])
  return describeSettled(view, promise, key)
}
