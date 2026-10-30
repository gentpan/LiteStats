export const ACCENT_CHOICES = [
  { value: "purple", label: "紫色" },
  { value: "blue", label: "蓝色" },
  { value: "green", label: "绿色" },
  { value: "black", label: "黑色" },
] as const

export type AccentColor = typeof ACCENT_CHOICES[number]["value"]

const STORAGE_KEY = "litestats:accent"
const CHANGE_EVENT = "litestats:accent-change"
const values = ACCENT_CHOICES.map(choice => choice.value)
const favicons: Record<AccentColor, string> = {
  purple: "/favicon.svg?v=5",
  blue: "/favicon-blue.svg?v=5",
  green: "/favicon-green.svg?v=5",
  black: "/favicon-black.svg?v=5",
}

function accentValue(value: unknown): AccentColor {
  return typeof value === "string" && values.includes(value as AccentColor) ? value as AccentColor : "purple"
}

// Runs before styles and hydration. Only the fixed allowlist can reach the DOM;
// storage failures must not prevent the rest of the application from loading.
export const ACCENT_BOOTSTRAP_SCRIPT = `(function(){var value="purple";try{var saved=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(${JSON.stringify(values)}.indexOf(saved)!==-1)value=saved}catch(e){}document.documentElement.dataset.accent=value})()`

// Runs after the head's icon exists, with no second preference or storage read.
export const ACCENT_FAVICON_BOOTSTRAP_SCRIPT = `(function(){var icons=${JSON.stringify(favicons)};var value=document.documentElement.dataset.accent;var href=Object.prototype.hasOwnProperty.call(icons,value)?icons[value]:icons.purple;var icon=document.getElementById("app-favicon");if(icon&&icon.getAttribute("href")!==href)icon.setAttribute("href",href)})()`

export function readAccentColor(): AccentColor {
  return typeof document === "undefined" ? "purple" : accentValue(document.documentElement.dataset.accent)
}

export function syncAccentFavicon(value: AccentColor = readAccentColor()): void {
  if (typeof document === "undefined") return
  const icon = document.getElementById("app-favicon")
  const href = favicons[accentValue(value)]
  if (icon && icon.getAttribute("href") !== href) icon.setAttribute("href", href)
}

export function setAccentColor(value: AccentColor): boolean {
  const accent = accentValue(value)
  document.documentElement.dataset.accent = accent
  syncAccentFavicon(accent)
  let saved = true
  try { localStorage.setItem(STORAGE_KEY, accent) } catch { saved = false }
  window.dispatchEvent(new Event(CHANGE_EVENT))
  return saved
}

export function subscribeAccentColor(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    // Session-storage events do not represent this preference.
    try { if (event.storageArea && event.storageArea !== localStorage) return } catch { return }
    document.documentElement.dataset.accent = accentValue(event.newValue)
    syncAccentFavicon()
    onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}
