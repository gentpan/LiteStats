import type { ReactNode } from "react"

const BROWSER_ICONS: Record<string, string> = {
  Chrome: "chrome.svg",
  curl: "curl.svg",
  Safari: "safari.png",
  Firefox: "firefox.svg",
  "Microsoft Edge": "edge.svg",
  Edge: "edge.svg",
  Vivaldi: "vivaldi.svg",
  Opera: "opera.svg",
  "Samsung Browser": "samsung-internet.svg",
  Chromium: "chromium.svg",
  "UC Browser": "uc.svg",
  "Yandex Browser": "yandex.png",
  "DuckDuckGo Privacy Browser": "duckduckgo.svg",
  "MIUI Browser": "miui.webp",
  "Huawei Browser Mobile": "huawei.png",
  "QQ Browser": "qq.png",
  Ecosia: "ecosia.png",
  "vivo Browser": "vivo.png",
}

const OS_ICONS: Record<string, string> = {
  iOS: "ios.png",
  iPadOS: "ipad_os.png",
  macOS: "mac.png",
  Mac: "mac.png",
  Windows: "windows.png",
  "Windows Phone": "windows.png",
  Android: "android.png",
  "GNU/Linux": "gnu_linux.png",
  Linux: "gnu_linux.png",
  Ubuntu: "ubuntu.png",
  Debian: "gnu_linux.png",
  "Arch Linux": "gnu_linux.png",
  "Chrome OS": "chrome_os.png",
  "Fire OS": "fire_os.png",
  HarmonyOS: "harmony_os.png",
  Tizen: "tizen.png",
  PlayStation: "playstation.png",
  KaiOS: "kai_os.png",
  Fedora: "fedora.png",
  FreeBSD: "freebsd.png",
}

function countryFlagSrc(code: string, shape: "square" | "rect" = "square") {
  const raw = (code || "").trim().toLowerCase()
  const slug = !raw || raw === "zz" || raw === "a1" || raw === "(none)" || raw === "(NONE)"
    ? "xx"
    : /^[a-z]{2}(?:-[a-z0-9]+)?$/.test(raw)
      ? raw
      : "xx"
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
        if (img.src.includes("/4x3/") && !img.src.endsWith("/xx.svg")) {
          img.src = countryFlagSrc(code, "square")
          return
        }
        if (!img.src.endsWith("/xx.svg")) img.src = countryFlagSrc("xx", shape)
        else img.style.visibility = "hidden"
      }}
    />
  )
}

export function BrowserIcon({ name }: { name: string }) {
  const filename = BROWSER_ICONS[name] ?? "fallback.svg"
  return (
    <img
      alt=""
      src={`/images/icon/browser/${filename}`}
      className="inline-block mr-2 h-4 w-4"
      onError={(e) => { e.currentTarget.src = "/images/icon/browser/fallback.svg" }}
    />
  )
}

export function OsIcon({ name }: { name: string }) {
  const filename = OS_ICONS[name]
    || Object.entries(OS_ICONS).find(([key]) => name.startsWith(key))?.[1]
    || "fallback.svg"
  return (
    <img
      alt=""
      src={`/images/icon/os/${filename}`}
      className="inline-block mr-2 h-4 w-4"
      onError={(e) => { e.currentTarget.src = "/images/icon/os/fallback.svg" }}
    />
  )
}

const screenSvg = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "feather -mt-px inline-block",
}

export function DeviceIcon({ name }: { name: string }) {
  if (name === "Mobile") {
    return (
      <svg {...screenSvg}>
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12" y2="18" />
      </svg>
    )
  }
  if (name === "Tablet") {
    return (
      <svg {...screenSvg}>
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12" y2="18" />
      </svg>
    )
  }
  if (name === "Laptop") {
    return (
      <svg {...screenSvg}>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    )
  }
  if (name === "Desktop") {
    return (
      <svg {...screenSvg}>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  }
  if (name === "Ultra-wide") {
    return (
      <svg {...screenSvg}>
        <rect x="1" y="4" width="22" height="12" rx="2" ry="2" />
        <line x1="6" y1="20" x2="18" y2="20" />
        <line x1="12" y1="16" x2="12" y2="20" />
      </svg>
    )
  }
  return (
    <svg {...screenSvg}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="17.25" r="1.25" />
      <path d="M9.244 8.369c.422-1.608 1.733-2.44 3.201-2.364 1.45.075 2.799.872 2.737 2.722-.089 2.63-2.884 2.273-3.197 4.773h.011" />
    </svg>
  )
}

export function SourceFavicon({ name }: { name: string }) {
  const key = (name || "").trim()
  if (!key || key === "Direct" || key === "(none)" || key === "Direct / None") {
    return <img alt="" src="/images/icon/link.svg" className="mr-2 size-4" />
  }
  return (
    <img
      alt=""
      src={`/favicon/sources/${encodeURIComponent(key)}`}
      className="mr-2 size-4"
      onError={(e) => { e.currentTarget.src = "/images/icon/link.svg" }}
    />
  )
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

export function iconFor(kind: RowIconKind | undefined, name: string): ReactNode {
  return <RowIcon kind={kind} name={name} />
}
