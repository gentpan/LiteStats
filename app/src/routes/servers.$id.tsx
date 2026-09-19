import { ManagementHeader } from "~/components/ManagementHeader"
import { Surface } from "~/components/Surface"
import { CarrierMonitor } from "~/components/CarrierMonitor"
import { useT } from "~/lib/i18n"
import { Navigate } from "@tanstack/react-router"
import { type SearchSchemaInput, Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState, type ReactNode } from "react"
import { MonitorChart } from "~/components/MonitorChart"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { meFn, serverFn, serverHistoryFn } from "~/lib/actions"
import {
  formatBootTime,
  formatBps,
  formatBytes,
  formatLastSeen,
  formatUptime,
  mbToBytes,
  metricNum,
  metricText,
  parseLoadAvg,
  percent,
  serverOnline,
  serverRegion,
} from "~/lib/monitor-view"
import type { MonitorHistoryPoint } from "~/lib/monitor"
import { flagSrc, osIconName, osIconSrc } from "~/lib/os-icon"

const RANGES = [
  { id: "1h", hours: 1, label: "1 小时" },
  { id: "6h", hours: 6, label: "6 小时" },
  { id: "12h", hours: 12, label: "12 小时" },
  { id: "24h", hours: 24, label: "24 小时" },
  { id: "7d", hours: 168, label: "7 天" },
] as const

type RangeId = (typeof RANGES)[number]["id"]

export const Route = createFileRoute("/servers/$id")({
  validateSearch: (s: { range?: RangeId } & SearchSchemaInput) => ({
    range: (RANGES.some((r) => r.id === s.range) ? String(s.range) : "1h") as RangeId,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const me = await meFn()
    if (!me) return { me: null, server: null, history: [] as MonitorHistoryPoint[] }
    const hours = RANGES.find((r) => r.id === deps.range)?.hours || 1
    try {
      const [server, history] = await Promise.all([
        serverFn({ data: { id: params.id } }),
        serverHistoryFn({ data: { id: params.id, hours } }),
      ])
      return { me, server, history }
    } catch {
      return { me, server: null, history: [] as MonitorHistoryPoint[] }
    }
  },
  component: ServerDetailPage,
})

function ServerDetailPage() {
  const { t, locale } = useT()
  const { me, server: initial, history: initialHistory } = Route.useLoaderData()
  const { id } = Route.useParams()
  const { range } = Route.useSearch()
  const [server, setServer] = useState(initial)
  const [history, setHistory] = useState(initialHistory)

  useEffect(() => {
    setServer(initial)
    setHistory(initialHistory)
  }, [initial, initialHistory])

  useEffect(() => {
    if (!me || !id) return
    const hours = RANGES.find((r) => r.id === range)?.hours || 1
    const timer = window.setInterval(() => {
      void Promise.all([
        serverFn({ data: { id } }),
        serverHistoryFn({ data: { id, hours } }),
      ]).then(([next, rows]) => {
        setServer(next)
        setHistory(rows)
      }).catch(() => {})
    }, 5000)
    return () => window.clearInterval(timer)
  }, [me, id, range])

  if (!me) {
    return <Navigate to="/login" />
  }
  if (!server) {
    return (
      <Shell user={me}>
        <div className="pt-8">
          <SettingsHeader
            title={t("找不到这台服务器")}
            back={(
              <Link to="/servers" className="btn btn-secondary btn-sm settings-back">
                <BackArrow />{t("返回服务器")}</Link>
            )}
          />
        </div>
      </Shell>
    )
  }

  const metrics = server.latest_metrics || {}
  const online = serverOnline(server.last_seen_at)
  const region = serverRegion(server)
  const os = metricText(metrics, "os", "")
  const cpu = metricNum(metrics, "cpu")
  const ramUsed = metricNum(metrics, "ram_used")
  const ramTotal = metricNum(metrics, "ram_total")
  const diskUsed = metricNum(metrics, "disk_used")
  const diskTotal = metricNum(metrics, "disk_total")
  const load = parseLoadAvg(metricText(metrics, "load_avg", "0 0 0"))
  const labels = history.map((row) => row.at)
  const ramPct = history.map((row) => percent(row.ram_used || 0, row.ram_total || 0) || null)
  const diskPct = history.map((row) => percent(row.disk_used || 0, row.disk_total || 0) || null)

  return (
    <Shell user={me}>
      <div className="server-board pb-16">
        <ManagementHeader title={server.name}><Link to="/servers" className="btn btn-secondary"><BackArrow />{t("返回服务器")}</Link></ManagementHeader>
        <div className="management-toolbar">
          {flagSrc(region) ? <img src={flagSrc(region)} alt={region} className="h-5 w-7 object-contain" /> : null}
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {online ? t("在线") : t("离线")}
          </span>
          {os ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
              <img src={osIconSrc(os)} alt="" className="size-4" />
              {osIconName(os)}
            </span>
          ) : null}
          <span className="text-sm text-gray-400">{formatLastSeen(server.last_seen_at, locale)}</span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="CPU" value={`${cpu.toFixed(1)}%`} hint={metricText(metrics, "cpu_info")} />
          <Stat label={t("内存")} value={`${percent(ramUsed, ramTotal).toFixed(1)}%`} hint={`${formatBytes(mbToBytes(ramUsed))} / ${formatBytes(mbToBytes(ramTotal))}`} />
          <Stat label={t("硬盘")} value={`${percent(diskUsed, diskTotal).toFixed(1)}%`} hint={`${formatBytes(mbToBytes(diskUsed))} / ${formatBytes(mbToBytes(diskTotal))}`} />
          <Stat label={t("负载")} value={load[0].toFixed(2)} hint={`${load[1].toFixed(2)} / ${load[2].toFixed(2)}`} />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InfoCard title={t("系统信息")} items={[
            [t("操作系统"), os || "—"],
            [t("架构"), metricText(metrics, "arch")],
            [t("内核"), metricText(metrics, "kernel_version")],
            [t("启动时间"), formatBootTime(metricNum(metrics, "boot_time"), locale)],
            [t("已运行"), formatUptime(metricNum(metrics, "boot_time"), locale)],
            [t("进程"), String(metricNum(metrics, "processes"))],
          ]} />
          <InfoCard title={t("网络信息")} items={[
            [t("入站"), formatBps(metricNum(metrics, "net_in_speed"))],
            [t("出站"), formatBps(metricNum(metrics, "net_out_speed"))],
            [t("累计入站"), formatBytes(metricNum(metrics, "net_rx"))],
            [t("累计出站"), formatBytes(metricNum(metrics, "net_tx"))],
            ["TCP / UDP", `${metricNum(metrics, "tcp_conn")} / ${metricNum(metrics, "udp_conn")}`],
          ]} />
        </div>

        <div className="mb-4 flex flex-wrap gap-2" aria-label={t("时间范围")}>
          {RANGES.map((item) => (
            <Link
              key={item.id}
              to="/servers/$id"
              params={{ id }}
              search={{ range: item.id }}
              aria-current={range === item.id ? "page" : undefined}
              className={`btn ${range === item.id ? "btn-primary" : "btn-secondary"}`}
            >
              {t(item.label)}
            </Link>
          ))}
        </div>

        <CarrierMonitor metrics={metrics} history={history} online={online} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="CPU" value={`${cpu.toFixed(1)}%`}>
            <MonitorChart height={168} labels={labels} series={[{ id: "cpu", label: "CPU", color: "#f59e0b", values: history.map((row) => row.cpu) }]} formatValue={(n) => `${n.toFixed(1)}%`} />
          </ChartCard>
          <ChartCard title={t("内存")} value={`${percent(ramUsed, ramTotal).toFixed(1)}%`}>
            <MonitorChart height={168} labels={labels} series={[{ id: "ram", label: "内存", color: "#10b981", values: ramPct }]} formatValue={(n) => `${n.toFixed(1)}%`} />
          </ChartCard>
          <ChartCard title={t("硬盘")} value={`${percent(diskUsed, diskTotal).toFixed(1)}%`}>
            <MonitorChart height={168} labels={labels} series={[{ id: "disk", label: "硬盘", color: "#6366f1", values: diskPct }]} formatValue={(n) => `${n.toFixed(1)}%`} />
          </ChartCard>
          <ChartCard title={t("网络")} value={`${formatBps(metricNum(metrics, "net_in_speed"))} / ${formatBps(metricNum(metrics, "net_out_speed"))}`}>
            <MonitorChart
              height={168}
              labels={labels}
              series={[
                { id: "in", label: "下载", color: "#3b82f6", values: history.map((row) => row.net_in_speed) },
                { id: "out", label: "上传", color: "#8b5cf6", values: history.map((row) => row.net_out_speed) },
              ]}
              formatValue={(n) => formatBps(n)}
            />
          </ChartCard>
          <ChartCard title={t("连接")} value={`TCP ${metricNum(metrics, "tcp_conn")} · UDP ${metricNum(metrics, "udp_conn")}`}>
            <MonitorChart
              height={168}
              labels={labels}
              series={[
                { id: "tcp", label: "TCP", color: "#ef4444", values: history.map((row) => row.tcp_conn) },
                { id: "udp", label: "UDP", color: "#14b8a6", values: history.map((row) => row.udp_conn) },
              ]}
            />
          </ChartCard>
          <ChartCard title={t("进程")} value={String(metricNum(metrics, "processes"))}>
            <MonitorChart height={168} labels={labels} series={[{ id: "proc", label: "进程", color: "#6366f1", values: history.map((row) => row.processes) }]} />
          </ChartCard>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <ChartCard title={t("负载")}>
            <MonitorChart
              height={200}
              labels={labels}
              series={[
                { id: "l1", label: "1 分钟", color: "#10b981", values: history.map((row) => row.load1) },
                { id: "l5", label: "5 分钟", color: "#f59e0b", values: history.map((row) => row.load5) },
                { id: "l15", label: "15 分钟", color: "#8b5cf6", values: history.map((row) => row.load15) },
              ]}
            />
          </ChartCard>

        </div>
      </div>
    </Shell>
  )
}

function Stat({ label, value, hint }: { label: string, value: string, hint?: string }) {
  const { t } = useT()
  return (
    <Surface className="min-w-0 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium tracking-wide text-gray-500">{t(label || "")}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-gray-400">{t(hint || "")}</div> : null}
    </Surface>
  )
}

function InfoCard({ title, items }: { title: string, items: Array<[string, string]> }) {
  const { t } = useT()
  return (
    <Surface className="min-w-0 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{t(title || "")}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={t(label || "")} className="rounded-md bg-gray-50 px-2.5 py-2">
            <dt className="text-xs text-gray-500">{t(label || "")}</dt>
            <dd className="mt-0.5 break-all text-sm text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  )
}

function ChartCard({ title, value, children }: { title: string, value?: string, children: ReactNode }) {
  const { t } = useT()
  return (
    <Surface className="min-w-0 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{t(title || "")}</h3>
        {value ? <span className="truncate text-xs text-gray-500">{value}</span> : null}
      </div>
      {children}
    </Surface>
  )
}
