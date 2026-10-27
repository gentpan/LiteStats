export type SiteLayout = "grid" | "compact"

const STORAGE_KEY = "litestats:site-layout"
const CHANGE_EVENT = "litestats:site-layout-change"
const layoutValue = (value: unknown): SiteLayout => value === "grid" ? "grid" : "compact"

// Apply before the first paint so a saved grid does not briefly render as rows.
export const SITE_LAYOUT_BOOTSTRAP_SCRIPT = `(function(){var value="compact";try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="grid")value="grid"}catch(e){}document.documentElement.dataset.siteLayout=value})()`

export function readSiteLayout(): SiteLayout {
  return typeof document === "undefined" ? "compact" : layoutValue(document.documentElement.dataset.siteLayout)
}

export function setSiteLayout(value: SiteLayout): boolean {
  const layout = layoutValue(value)
  document.documentElement.dataset.siteLayout = layout
  let saved = true
  try { localStorage.setItem(STORAGE_KEY, layout) } catch { saved = false }
  window.dispatchEvent(new Event(CHANGE_EVENT))
  return saved
}

export function subscribeSiteLayout(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    try { if (event.storageArea && event.storageArea !== localStorage) return } catch { return }
    document.documentElement.dataset.siteLayout = layoutValue(event.newValue)
    onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}
