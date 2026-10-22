const STORAGE_KEY = "litestats:map-flags"

// Geography is loaded after hydration, so restore the preference before any
// flag markers are drawn. Missing, invalid or unavailable storage shows flags.
export function readMapFlags(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "hidden" } catch { return true }
}

export function saveMapFlags(show: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, show ? "visible" : "hidden") } catch { /* Keep the current page usable when storage is blocked. */ }
}
