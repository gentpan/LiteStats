import { useEffect, useRef } from "react"
import { useRouter } from "@tanstack/react-router"

type RefreshOptions = {
  intervalMs?: number
  onError?: () => void
  scheduler?: Pick<Window, "setInterval" | "clearInterval">
  visibility?: Pick<Document, "visibilityState">
}

export function startRouterRefresh(refresh: () => Promise<unknown>, {
  intervalMs = 30_000,
  onError,
  scheduler = window,
  visibility = document,
}: RefreshOptions = {}) {
  let disposed = false
  let refreshing = false
  const timer = scheduler.setInterval(() => {
    if (disposed || refreshing || visibility.visibilityState !== "visible") return
    refreshing = true
    void refresh().catch(() => onError?.()).finally(() => { refreshing = false })
  }, intervalMs)
  return () => {
    disposed = true
    scheduler.clearInterval(timer)
  }
}

export function useRouterAutoRefresh({enabled = true, onError}: {enabled?: boolean; onError?: () => void} = {}) {
  const router = useRouter()
  const errorRef = useRef(onError)
  errorRef.current = onError
  useEffect(() => {
    if (!enabled) return
    return startRouterRefresh(() => router.invalidate(), {onError: () => errorRef.current?.()})
  }, [router, enabled])
}
