import {
  createMonitorServer,
  deleteMonitorServer,
  getCfsmHistory,
  getLatencyWindows,
  getMonitorServer,
  getMonitorServerAdmin,
  getMonitorSettings,
  listMonitorServers,
  listMonitorServersAdmin,
  saveMonitorServerOrder,
  saveMonitorSettings,
  startMonitorCollectorNow,
  updateMonitorServerMeta,
  type MonitorServerRow,
} from "./monitor"
import type { MonitorMetrics } from "./monitor-view"

const ONLINE_MS = 300_000
const SITE_TITLE = "LiteStats"

export const CFSM_CONFIG = {
  version: "2.8.5",
  last_workers_version: "",
  last_agent_version: "",
  is_public: true,
  authorization: true,
  turnstile_enabled: false,
  turnstile_login_enabled: false,
  turnstile_site_key: "",
  custom_ct_name: "电信",
  custom_cu_name: "联通",
  custom_cm_name: "移动",
  custom_bd_name: "BGP",
  node_1_name: "Node 1",
  node_2_name: "Node 2",
  node_3_name: "Node 3",
  node_4_name: "Node 4",
  site_title: SITE_TITLE,
  display_mode: "bar",
  preferred_theme: "auto",
  default_language: "zh",
  theme_options: {},
  verified: true,
  frontend_ws_timeout_minutes: 0,
  long_history_points: 120,
  latency_window: { points: 20, hours: 2 },
  show_price: true,
  show_expire: true,
  show_tf: true,
  show_three_net_details: true,
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function metricValue(metrics: MonitorMetrics, key: string) {
  const raw = metrics[key]
  if (raw === false || raw === "false") return false
  if (raw == null || raw === "") return undefined
  if (typeof raw === "number") return raw
  if (typeof raw === "boolean") return raw
  const n = Number(raw)
  return Number.isFinite(n) ? n : raw
}

function lastSeenMs(row: MonitorServerRow) {
  if (!row.last_seen_at) return 0
  const ms = new Date(row.last_seen_at).getTime()
  return Number.isFinite(ms) ? ms : 0
}

export function toCfsmServer(row: MonitorServerRow, extra: Record<string, unknown> = {}) {
  const metrics = (row.latest_metrics || {}) as MonitorMetrics
  const meta = asRecord(row.meta)
  const lastUpdated = lastSeenMs(row)
  const keys = [
    "cpu", "load_avg", "net_in_speed", "net_out_speed", "net_rx", "net_tx",
    "net_rx_monthly", "net_tx_monthly", "processes", "tcp_conn", "udp_conn",
    "ping_ct", "ping_cu", "ping_cm", "ping_bd",
    "loss_ct", "loss_cu", "loss_cm", "loss_bd",
    "ping_node_1", "ping_node_2", "ping_node_3", "ping_node_4",
    "loss_node_1", "loss_node_2", "loss_node_3", "loss_node_4",
    "ram_total", "ram_used", "swap_total", "swap_used",
    "disk_total", "disk_used", "cpu_cores", "cpu_info", "gpu_info",
    "arch", "os", "kernel_version", "agent_version", "boot_time",
    "ip_v4", "ip_v6",
  ] as const
  const merged: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    region: String(meta.region || metrics.region || ""),
    region_override: String(meta.region || ""),
    server_group: String(meta.server_group || "Default"),
    tags: String(meta.tags || ""),
    note: String(meta.note || ""),
    price: meta.price || "",
    billing_cycle: meta.billing_cycle || "",
    auto_renewal: meta.auto_renewal || "0",
    currency: meta.currency || "¥",
    expire_date: meta.expire_date || "",
    traffic_limit: meta.traffic_limit || "",
    traffic_calc_type: meta.traffic_calc_type || "total",
    last_updated: lastUpdated,
    report_timestamp: lastUpdated,
    is_online: lastUpdated > 0 && Date.now() - lastUpdated < ONLINE_MS,
    hidden: !!row.hidden,
    is_hidden: row.hidden ? "1" : "0",
    ...extra,
  }
  for (const key of keys) {
    const value = metricValue(metrics, key)
    if (value !== undefined) merged[key] = value
  }
  if (!merged.load_avg) merged.load_avg = "0 0 0"
  if (!merged.ip_v4) merged.ip_v4 = "0"
  if (!merged.ip_v6) merged.ip_v6 = "0"
  return merged
}

export async function cfsmConfig() {
  await startMonitorCollectorNow()
  const stored = await getMonitorSettings()
  return {
    ...CFSM_CONFIG,
    ...stored,
    is_public: true,
    authorization: true,
    verified: true,
    turnstile_enabled: false,
    turnstile_login_enabled: false,
    site_title: String(stored.site_title || CFSM_CONFIG.site_title),
    latency_window: CFSM_CONFIG.latency_window,
  }
}

export async function cfsmServersPayload() {
  await startMonitorCollectorNow()
  const [rows, settings] = await Promise.all([listMonitorServers(), cfsmConfig()])
  const windows = await getLatencyWindows(rows.map((row) => row.id), 20, 2)
  const now = Date.now()
  let online = 0
  let globalSpeedIn = 0
  let globalSpeedOut = 0
  let globalNetRx = 0
  let globalNetTx = 0
  const regionStats: Record<string, number> = {}
  const servers = rows.map((row) => {
    const item = toCfsmServer(row)
    const window = windows.get(row.id) || { ping: [], loss: [] }
    item.ping = window.ping
    item.loss = window.loss
    if (item.is_online) {
      online += 1
      globalSpeedIn += Number(item.net_in_speed) || 0
      globalSpeedOut += Number(item.net_out_speed) || 0
    }
    globalNetRx += Number(item.net_rx) || 0
    globalNetTx += Number(item.net_tx) || 0
    const code = String(item.region || "").toUpperCase()
    if (code) regionStats[code] = (regionStats[code] || 0) + 1
    item.current_timestamp = now
    return item
  })
  return {
    servers,
    latestReportUpdates: [],
    stats: {
      total: servers.length,
      online,
      offline: servers.length - online,
      globalSpeedIn,
      globalSpeedOut,
      globalNetRx,
      globalNetTx,
    },
    regionStats,
    sysConfig: {
      show_price: settings.show_price !== false,
      show_expire: settings.show_expire !== false,
      show_tf: settings.show_tf !== false,
      show_three_net_details: settings.show_three_net_details !== false,
      custom_ct_name: settings.custom_ct_name || "电信",
      custom_cu_name: settings.custom_cu_name || "联通",
      custom_cm_name: settings.custom_cm_name || "移动",
      custom_bd_name: settings.custom_bd_name || "BGP",
      display_mode: settings.display_mode || "bar",
      latency_window: CFSM_CONFIG.latency_window,
    },
  }
}

export async function cfsmServerDetail(id: string) {
  await startMonitorCollectorNow()
  const row = await getMonitorServer(id)
  if (!row) return null
  const settings = await cfsmConfig()
  return {
    ...toCfsmServer(row),
    latestReportUpdates: [],
    sysConfig: { long_history_points: Number(settings.long_history_points || 120) },
  }
}

export async function cfsmHistory(id: string, hours: number) {
  const row = await getMonitorServer(id)
  if (!row) return null
  return getCfsmHistory(id, hours)
}

function settingsForAdmin(stored: Record<string, unknown>) {
  return {
    site_title: stored.site_title || SITE_TITLE,
    display_mode: stored.display_mode || "bar",
    preferred_theme: stored.preferred_theme || "auto",
    default_language: stored.default_language || "zh",
    theme_options: stored.theme_options || {},
    is_public: "true",
    show_price: stored.show_price === false ? "false" : "true",
    show_expire: stored.show_expire === false ? "false" : "true",
    show_tf: stored.show_tf === false ? "false" : "true",
    show_three_net_details: stored.show_three_net_details === false ? "false" : "true",
    wss_report_enabled: "false",
    frontend_ws_timeout_minutes: 0,
    long_history_points: String(stored.long_history_points || 120),
    custom_ct_name: stored.custom_ct_name || "电信",
    custom_cu_name: stored.custom_cu_name || "联通",
    custom_cm_name: stored.custom_cm_name || "移动",
    custom_bd_name: stored.custom_bd_name || "BGP",
    username: "litestats",
  }
}

export async function handleCfsmAdmin(data: Record<string, unknown>) {
  const action = String(data.action || "")
  await startMonitorCollectorNow()

  if (action === "login") {
    return { success: true, token: "litestats-session", message: "loginSuccessful" }
  }
  if (action === "logout" || action === "clear_theme_preview_auth") {
    return { success: true }
  }
  if (action === "get_settings") {
    const stored = await getMonitorSettings()
    return { success: true, settings: settingsForAdmin(stored), api_secret: "" }
  }
  if (action === "save_settings" || action === "save_theme_options") {
    const settings = asRecord(data.settings)
    const themeOptions = data.theme_options ?? settings.theme_options
    const saved = await saveMonitorSettings({
      ...settings,
      ...(themeOptions !== undefined ? { theme_options: themeOptions } : {}),
    })
    return { success: true, theme_options: saved.theme_options || themeOptions || {}, message: "updateSuccess" }
  }
  if (action === "list") {
    const rows = await listMonitorServersAdmin()
    const windows = await getLatencyWindows(rows.map((row) => row.id), 20, 2)
    const servers = rows.map((row) => {
      const item = toCfsmServer(row, { secret: row.secret })
      const window = windows.get(row.id)
      if (window) {
        item.ping = window.ping
        item.loss = window.loss
      }
      return item
    })
    const online = servers.filter((item) => item.is_online).length
    const cpuSum = servers.reduce((sum, item) => sum + (item.is_online ? Number(item.cpu) || 0 : 0), 0)
    return {
      success: true,
      servers,
      stats: {
        total: servers.length,
        online,
        offline: servers.length - online,
        avg_cpu: online ? (cpuSum / online).toFixed(2) : 0,
      },
    }
  }
  if (action === "add") {
    const row = await createMonitorServer(String(data.name || ""))
    if (data.server_group || data.region) {
      await updateMonitorServerMeta(row.id, {
        meta: {
          server_group: String(data.server_group || "Default"),
          region: String(data.region || "").toUpperCase(),
        },
      })
    }
    return { success: true, id: row.id, secret: row.secret, message: "serverAdded" }
  }
  if (action === "delete") {
    await deleteMonitorServer(String(data.id || ""))
    return { success: true, message: "serverDeleted" }
  }
  if (action === "batch_delete") {
    const ids = Array.isArray(data.ids) ? data.ids : []
    for (const id of ids) {
      try {
        await deleteMonitorServer(String(id))
      } catch {
        // skip local / missing
      }
    }
    return { success: true, message: "serverDeleted" }
  }
  if (action === "save_order") {
    const orders = Array.isArray(data.orders) ? data.orders as Array<{ id: string, sort_order?: number, position?: number }> : []
    await saveMonitorServerOrder(orders)
    return { success: true, message: "sortOrderSaved" }
  }
  if (action === "edit") {
    const id = String(data.id || "")
    const existing = await getMonitorServerAdmin(id)
    if (!existing) return { error: "Server not found", code: 404 }
    await updateMonitorServerMeta(id, {
      name: data.name != null ? String(data.name) : undefined,
      hidden: data.is_hidden == null ? undefined : (data.is_hidden === "1" || data.is_hidden === true || data.is_hidden === 1),
      meta: {
        region: String(data.region || "").toUpperCase(),
        server_group: String(data.server_group || "Default"),
        tags: data.tags || "",
        note: data.note || "",
        price: data.price || "",
        billing_cycle: data.billing_cycle || "",
        auto_renewal: data.auto_renewal || "0",
        currency: data.currency || "¥",
        expire_date: data.expire_date || "",
        traffic_limit: data.traffic_limit || "",
        traffic_calc_type: data.traffic_calc_type || "total",
      },
    })
    return { success: true, message: "serverUpdated" }
  }
  if (action === "d1_usage" || action === "send_test_notification" || action === "start_theme_preview" || action === "export_servers") {
    return { success: true }
  }
  return { success: true }
}
