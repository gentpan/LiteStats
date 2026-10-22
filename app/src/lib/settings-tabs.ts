export const ACCOUNT_TABS = [
  { id: "preferences", label: "偏好设置", icon: "cog" },
  { id: "security", label: "安全", icon: "lock" },
] as const

export const SYSTEM_TABS = [
  { id: "system/mapbox", label: "访客地图", icon: "map" },
  { id: "system/backup", label: "备份与恢复", icon: "cloud" },
] as const

export const SITE_TABS = [
  { id: "general", label: "常规", icon: "rocket" },
  { id: "visibility", label: "可见性", icon: "eye" },
  { id: "installation", label: "安装脚本", icon: "code" },
  { id: "integrations", label: "集成", icon: "puzzle" },
  { id: "danger-zone", label: "危险操作", icon: "warn" },
] as const

export function accountTab(value: unknown) {
  if (value === "backup") return "system/backup"
  return [...ACCOUNT_TABS, ...SYSTEM_TABS].find(tab => tab.id === value)?.id || "preferences"
}

export function siteTab(value: unknown) {
  return SITE_TABS.find(tab => tab.id === value)?.id || "general"
}
