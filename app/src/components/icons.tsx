import { UIIcon } from "./UIIcon"
import { ImageWithFallback } from "./ImageWithFallback"

const BROWSER_BRANDS: Record<string, string> = {
  Chrome: "chrome",
  Chromium: "chrome",
  Safari: "safari",
  Firefox: "firefox",
  "Microsoft Edge": "edge",
  Edge: "edge",
  Opera: "opera",
  "Yandex Browser": "yandex",
  "QQ Browser": "qq",
}

const BROWSER_ICONS: Record<string, string> = {
  curl: "curl.svg",
  Vivaldi: "vivaldi.svg",
  "Samsung Browser": "samsung-internet.svg",
  "UC Browser": "uc.svg",
  "DuckDuckGo Privacy Browser": "duckduckgo.svg",
  "MIUI Browser": "miui.webp",
  "Huawei Browser Mobile": "huawei.png",
  Ecosia: "ecosia.png",
  "vivo Browser": "vivo.png",
}

const OS_BRANDS: Record<string, string> = {
  iOS: "apple",
  iPadOS: "apple",
  macOS: "apple",
  Mac: "apple",
  Windows: "windows",
  "Windows Phone": "windows",
  Android: "android",
  "GNU/Linux": "linux",
  Linux: "linux",
  Ubuntu: "ubuntu",
  Debian: "debian",
  "Arch Linux": "linux",
  "Chrome OS": "chrome",
  PlayStation: "playstation",
  Fedora: "fedora",
  FreeBSD: "freebsd",
}

const OS_ICONS: Record<string, string> = {
  "Fire OS": "fire_os.png",
  HarmonyOS: "harmony_os.png",
  Tizen: "tizen.png",
  KaiOS: "kai_os.png",
}

function countryFlagSrc(code: string, shape: "square" | "rect" = "square") {
  const raw = (code || "").trim().toLowerCase()
  const slug = !raw || raw === "zz" || raw === "a1" || raw === "(none)" || raw === "(NONE)"
    ? "xx"
    : /^[a-z]{2}(?:-[a-z0-9]+)?$/.test(raw)
      ? raw
      : "xx"
  // Rectangular flags share the map assets; retain the existing dedicated Taiwan path.
  if (shape === "rect" && slug !== "tw") return `/flags/${slug}.svg`
  return `/images/flags/${shape === "rect" ? "4x3" : "1x1"}/${slug}.svg`
}

export function CountryFlag({ code, className = "", shape = "square" }: { code: string, className?: string, shape?: "square" | "rect" }) {
  const src = countryFlagSrc(code, shape)
  return (
    <img
      alt=""
      src={src}
      className={`country-flag ${className.includes("country-flag--") ? "" : shape === "rect" ? "country-flag--rect" : "country-flag--square"} ${className}`.trim()}
      onError={(e) => {
        const img = e.currentTarget
        if (shape === "rect" && !img.src.includes("/1x1/") && !img.src.endsWith("/xx.svg")) {
          img.src = countryFlagSrc(code, "square")
          return
        }
        if (!img.src.endsWith("/xx.svg")) img.src = countryFlagSrc("xx", shape)
        else img.style.visibility = "hidden"
      }}
    />
  )
}

const rowIconClassName = "mr-2 h-4 w-4 shrink-0"

function AssetIcon({ src, fallback }: { src: string, fallback: string }) {
  return <ImageWithFallback src={src} className={`${rowIconClassName} object-contain`} fallback={<UIIcon name={fallback} className={rowIconClassName}/>}/>
}

function BrowserIcon({ name }: { name: string }) {
  const brand = BROWSER_BRANDS[name]
  if (brand) return <UIIcon name={`brand-${brand}`} className={rowIconClassName} />
  const filename = BROWSER_ICONS[name]
  if (filename) return <AssetIcon src={`/images/icon/browser/${filename}`} fallback="browser" />
  return <UIIcon name="browser" className={rowIconClassName} />
}

function OsIcon({ name }: { name: string }) {
  const brand = OS_BRANDS[name]
    || Object.entries(OS_BRANDS).find(([key]) => name.startsWith(key))?.[1]
  if (brand) return <UIIcon name={`brand-${brand}`} className={rowIconClassName} />
  const filename = OS_ICONS[name]
    || Object.entries(OS_ICONS).find(([key]) => name.startsWith(key))?.[1]
  if (filename) return <AssetIcon src={`/images/icon/os/${filename}`} fallback="unknown" />
  return <UIIcon name="unknown" className={rowIconClassName} />
}

const DEVICE_ICONS: Record<string, string> = {
  Mobile: "device-mobile",
  Tablet: "device-tablet",
  Laptop: "device-laptop",
  Desktop: "device-desktop",
  "Ultra-wide": "device-ultrawide",
}

function DeviceIcon({ name }: { name: string }) {
  return <UIIcon name={DEVICE_ICONS[name] || "unknown"} className="-mt-px h-5 w-5" />
}

function SourceFavicon({ name }: { name: string }) {
  const key = (name || "").trim()
  if (!key || key === "Direct" || key === "(none)" || key === "Direct / None") {
    return <UIIcon name="link" className={rowIconClassName} />
  }
  return <AssetIcon src={`/favicon/sources/${encodeURIComponent(key)}`} fallback="link" />
}

export type RowIconKind = "source" | "country" | "browser" | "os" | "device"

export function RowIcon({ kind, name }: { kind?: RowIconKind, name: string }) {
  if (!kind) return null
  if (kind === "source") return <SourceFavicon name={name} />
  if (kind === "country") return <CountryFlag code={name} />
  if (kind === "browser") return <BrowserIcon name={name} />
  if (kind === "os") return <OsIcon name={name} />
  if (kind === "device") return <span className="mr-1.5"><DeviceIcon name={name} /></span>
  return null
}
