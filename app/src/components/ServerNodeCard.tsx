import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  formatBytes,
  formatBps,
  formatUptime,
  mbToBytes,
  metricNum,
  metricText,
  parseLoadAvg,
  percent,
  pingLabel,
  serverOnline,
  serverPrice,
  serverRegion,
  usageTone,
  type MonitorServer,
} from "~/lib/monitor-view"
import { flagSrc, osIconName, osIconSrc } from "~/lib/os-icon"

function barClass(tone: "ok" | "warn" | "bad") {
  if (tone === "bad") return "bg-red-500"
  if (tone === "warn") return "bg-amber-400"
  return "bg-emerald-500"
}

function pingTone(label: string | null) {
  if (!label) return "text-gray-400"
  const n = parseInt(label, 10)
  if (!Number.isFinite(n)) return "text-gray-400"
  if (n < 80) return "text-emerald-600"
  if (n < 160) return "text-indigo-600"
  if (n < 240) return "text-amber-600"
  return "text-red-600"
}

export function ServerNodeCard({
  server,
  onInstall,
  onRemove,
}: {
  server: MonitorServer
  onInstall?: () => void
  onRemove?: () => void
}) {
  const metrics = server.latest_metrics || {}
  const online = serverOnline(server.last_seen_at)
  const cpu = metricNum(metrics, "cpu")
  const ramUsed = metricNum(metrics, "ram_used")
  const ramTotal = metricNum(metrics, "ram_total")
  const diskUsed = metricNum(metrics, "disk_used")
  const diskTotal = metricNum(metrics, "disk_total")
  const ramPct = percent(ramUsed, ramTotal)
  const diskPct = percent(diskUsed, diskTotal)
  const load = parseLoadAvg(metricText(metrics, "load_avg", "0 0 0"))
  const region = serverRegion(server)
  const flag = flagSrc(region)
  const os = metricText(metrics, "os", "")
  const pings = [
    pingLabel(metrics, "ping_ct"),
    pingLabel(metrics, "ping_cu"),
    pingLabel(metrics, "ping_cm"),
  ].filter(Boolean) as string[]
  const traffic = metricNum(metrics, "net_rx") + metricNum(metrics, "net_tx")

  return (
    <article className={`server-node ${online ? "" : "is-offline"}`}>
      <div className="server-node-head">
        <Link to="/servers/$id" params={{ id: server.id }} className="server-node-title">
          <span className={`server-node-dot ${online ? "is-on" : "is-off"}`} />
          <span className="truncate font-semibold text-gray-900">{server.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          {os ? <img src={osIconSrc(os)} alt={osIconName(os)} className="size-4" /> : null}
          {flag ? <img src={flag} alt={region} className="h-4 w-5 rounded-sm object-cover" /> : null}
        </div>
      </div>
      <Link to="/servers/$id" params={{ id: server.id }} className="relative block">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Meter label="CPU" value={cpu} display={`${cpu.toFixed(1)}%`} extra={`${load[0].toFixed(2)}, ${load[1].toFixed(2)}, ${load[2].toFixed(2)}`} />
          <Meter label="内存" value={ramPct} display={`${ramPct.toFixed(1)}%`} extra={`${formatBytes(mbToBytes(ramUsed))} / ${formatBytes(mbToBytes(ramTotal))}`} />
          <Meter label="硬盘" value={diskPct} display={`${diskPct.toFixed(1)}%`} extra={`${formatBytes(mbToBytes(diskUsed))} / ${formatBytes(mbToBytes(diskTotal))}`} />
          <Meter label="流量" value={0} display="∞" extra={`${formatBytes(traffic)} / ∞`} />
        </div>
        {!online ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end pb-6">
            <span className="text-sm font-medium text-red-600">离线</span>
          </div>
        ) : null}
        <div className={`mt-3 space-y-1.5 text-[11px] text-gray-500 ${online ? "" : "opacity-40"}`}>
          <Row label="速率">
            <span className="text-emerald-600">↑ {formatBps(metricNum(metrics, "net_out_speed"))}</span>
            <span className="text-indigo-600">↓ {formatBps(metricNum(metrics, "net_in_speed"))}</span>
          </Row>
          <Row label="在线">{formatUptime(metricNum(metrics, "boot_time"))}</Row>
          <Row label="费用">{serverPrice(server)}</Row>
          <Row label="三网">
            {pings.length ? pings.map((item, i) => (
              <span key={item + i} className={pingTone(item)}>{i ? " · " : ""}{item.replace(" ms", "ms")}</span>
            )) : "—"}
          </Row>
        </div>
      </Link>
      {server.kind !== "local" ? (
        <div className="mt-3 flex justify-end gap-3 text-xs">
          {onInstall ? <button type="button" className="text-indigo-600 hover:text-indigo-500" onClick={onInstall}>安装命令</button> : null}
          {onRemove ? <button type="button" className="text-red-600 hover:text-red-500" onClick={onRemove}>删除</button> : null}
        </div>
      ) : null}
    </article>
  )
}

function Meter({ label, value, display, extra }: { label: string, value: number, display: string, extra: string }) {
  const tone = usageTone(value)
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-800">{display}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${barClass(tone)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <p className="mt-1 truncate text-[11px] text-gray-400">{extra}</p>
    </div>
  )
}

function Row({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div className="flex items-center">
      <span>{label}</span>
      <span className="mx-2 h-px flex-1 border-t border-dotted border-gray-200" />
      <span className="flex items-center gap-1.5 text-gray-700">{children}</span>
    </div>
  )
}
