const ICONS = [
  { name: "macOS", file: "os-macos.svg", keys: ["macos", "mac os", "darwin", "os x"] },
  { name: "Ubuntu", file: "os-ubuntu.svg", keys: ["ubuntu", "elementary"] },
  { name: "Debian", file: "os-debian.svg", keys: ["debian", "deb"] },
  { name: "Windows", file: "os-windows.svg", keys: ["windows", "win32", "win64"] },
  { name: "CentOS", file: "os-centos.svg", keys: ["centos"] },
  { name: "Fedora", file: "os-fedora.svg", keys: ["fedora"] },
  { name: "Arch Linux", file: "os-arch.svg", keys: ["arch"] },
  { name: "Alpine", file: "os-alpine.webp", keys: ["alpine"] },
  { name: "OpenWrt", file: "os-openwrt.svg", keys: ["openwrt"] },
  { name: "Rocky", file: "os-rocky.svg", keys: ["rocky"] },
  { name: "AlmaLinux", file: "os-alma.svg", keys: ["alma"] },
  { name: "Red Hat", file: "os-redhat.svg", keys: ["redhat", "rhel", "red hat"] },
]

export function osIconSrc(os: string) {
  const text = os.toLowerCase()
  const hit = ICONS.find((item) => item.keys.some((key) => text.includes(key)))
  return `/os-icons/${hit?.file || "os-unknown.svg"}`
}

export function osIconName(os: string) {
  const text = os.toLowerCase()
  return ICONS.find((item) => item.keys.some((key) => text.includes(key)))?.name || os || "Unknown"
}

export function flagSrc(region: string) {
  const code = region.trim().toLowerCase()
  if (!code || code === "xx") return ""
  return `/flags/${code === "tw" ? "cn" : code}.svg`
}
