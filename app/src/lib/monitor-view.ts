export type MonitorMetrics = Record<string, number | string | boolean>
export type MonitorServer = {
  id: string
  name: string
  kind: "local" | "agent"
  last_seen_at: string | null
  latest_metrics: MonitorMetrics
  position: number
  hidden?: boolean
  meta?: Record<string, unknown>
}

const OFFLINE_AFTER_MS = 180_000

export function serverOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() <= OFFLINE_AFTER_MS
}

export function metricNum(metrics: MonitorMetrics, key: string, fallback = 0) {
  const raw = metrics[key]
  if (typeof raw === "number") return raw
  if (typeof raw === "string") {
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

export function metricText(metrics: MonitorMetrics, key: string, fallback = "—") {
  const raw = metrics[key]
  if (typeof raw === "string" && raw) return raw
  if (typeof raw === "number") return String(raw)
  return fallback
}

export function formatMb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`
  return `${Math.round(value)} MB`
}

export function formatBps(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB/s`
  if (value >= 1000) return `${(value / 1000).toFixed(1)} KB/s`
  return `${Math.round(value)} B/s`
}

export function formatUptime(bootMs: number) {
  if (!bootMs || bootMs < 1_000_000_000) return "—"
  const seconds = Math.max(Math.floor(Date.now() / 1000 - bootMs / 1000), 0)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时`
  return `${Math.floor(seconds / 60)} 分钟`
}

export function mbToBytes(mb: number) {
  return Math.max(0, mb) * 1024 * 1024
}

export function usageTone(percent: number): "ok" | "warn" | "bad" {
  if (percent < 60) return "ok"
  if (percent < 80) return "warn"
  return "bad"
}

export function serverHealth(server: MonitorServer): "ok" | "warn" | "down" {
  if (!serverOnline(server.last_seen_at)) return "down"
  const metrics = server.latest_metrics || {}
  const cpu = metricNum(metrics, "cpu")
  const ram = percent(metricNum(metrics, "ram_used"), metricNum(metrics, "ram_total"))
  const disk = percent(metricNum(metrics, "disk_used"), metricNum(metrics, "disk_total"))
  if ([cpu, ram, disk].some((n) => usageTone(n) !== "ok")) return "warn"
  return "ok"
}

export function serverRegion(server: MonitorServer) {
  const meta = server.meta || {}
  const fromMeta = String(meta.region || "").trim()
  if (fromMeta) return fromMeta.toUpperCase()
  return String(server.latest_metrics.region || "").trim().toUpperCase()
}

export function serverPrice(server: MonitorServer) {
  const raw = String(server.meta?.price || "").trim()
  return raw || "—"
}

export function percent(used: number, total: number) {
  if (!total) return 0
  return Math.min((used / total) * 100, 100)
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0 B"
  if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(2)} TB`
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${Math.round(value)} B`
}

export function formatBootTime(bootMs: number) {
  if (!bootMs || bootMs < 1_000_000_000) return "—"
  return new Date(bootMs).toLocaleString()
}

export function formatLastSeen(lastSeen: string | null) {
  if (!lastSeen) return "从未上报"
  const ms = Date.now() - new Date(lastSeen).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "刚刚"
  if (ms < 15_000) return "刚刚"
  if (ms < 60_000) return `${Math.floor(ms / 1000)} 秒前`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小时前`
  return new Date(lastSeen).toLocaleString()
}

export function parseLoadAvg(value: string) {
  const parts = value.split(/\s+/).map((n) => Number(n))
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0] as const
}

export function pingLabel(metrics: MonitorMetrics, key: string) {
  const raw = metrics[key]
  if (raw === false || raw === "false" || raw == null) return null
  if (typeof raw === "number") return `${Math.round(raw)} ms`
  if (typeof raw === "string") return `${raw} ms`
  return null
}

export function agentInstallCommand(server: { id: string, secret: string }, origin: string) {
  const base = origin.replace(/\/$/, "")
  return `curl -fsSL ${base}/install.sh | sudo sh -s -- \\
  --url ${base} \\
  --id ${server.id} \\
  --secret ${server.secret}`
}
