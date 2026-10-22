export function parseUa(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : ""
  let os = ""
  let osVersion = ""
  if (/iPhone|iPad|iPod/.test(ua)) {
    os = "iOS"
    osVersion = (ua.match(/OS (\d+)[._]/) || [])[1] || ""
    if (osVersion) os = `iOS ${osVersion}`
  } else if (/Android/.test(ua)) {
    os = "Android"
    osVersion = (ua.match(/Android (\d+)/) || [])[1] || ""
    if (osVersion) os = `Android ${osVersion}`
  } else if (/CrOS/.test(ua)) {
    os = "Chrome OS"
  } else if (/Mac OS X/.test(ua)) {
    const major = (ua.match(/Mac OS X (\d+)[._](\d+)/) || [])[1] || ""
    const minor = (ua.match(/Mac OS X (\d+)[._](\d+)/) || [])[2] || ""
    osVersion = major === "10" && minor ? `10.${minor}` : major
    os = osVersion ? `macOS ${osVersion}` : "macOS"
  } else if (/Windows NT 10\.0/.test(ua)) {
    os = "Windows 10"
    osVersion = "10"
  } else if (/Windows NT 6\.3/.test(ua)) {
    os = "Windows 8.1"
    osVersion = "8.1"
  } else if (/Windows NT 6\.2/.test(ua)) {
    os = "Windows 8"
    osVersion = "8"
  } else if (/Windows NT 6\.1/.test(ua)) {
    os = "Windows 7"
    osVersion = "7"
  } else if (/Windows NT 6\.0/.test(ua)) {
    os = "Windows Vista"
    osVersion = "Vista"
  } else if (/Windows NT 5\.[12]/.test(ua)) {
    os = "Windows XP"
    osVersion = "XP"
  } else if (/Windows/.test(ua)) {
    os = "Windows"
  } else if (/Ubuntu/.test(ua)) {
    os = "Ubuntu"
  } else if (/Debian/.test(ua)) {
    os = "Debian"
  } else if (/Fedora/.test(ua)) {
    os = "Fedora"
  } else if (/Arch/.test(ua)) {
    os = "Arch Linux"
  } else if (/Linux/.test(ua)) {
    os = "Linux"
  }
  const browserVersion = ((ua.match(/(?:Edg|OPR|Chrome|Firefox)\/(\d+)/) || ua.match(/Version\/(\d+)/) || [])[1] || "")
  return { browser, browserVersion, os, osVersion }
}

export function screenSize(width?: number) {
  if (!width || width <= 0) return ""
  if (width < 576) return "Mobile"
  if (width < 992) return "Tablet"
  return "Desktop"
}
