import { useState } from "react"
import { Surface } from "./Surface"
import { MonitorChart } from "./MonitorChart"
import { useT } from "~/lib/i18n"
import { pingLabel, type MonitorMetrics } from "~/lib/monitor-view"
import type { MonitorHistoryPoint } from "~/lib/monitor"
import { formatTimestamp } from "~/lib/format"

const carriers = [
  { key: "ping_ct", label: "电信", color: "#10b981" },
  { key: "ping_cu", label: "联通", color: "#06b6d4" },
  { key: "ping_cm", label: "移动", color: "#8b5cf6" },
] as const

export function CarrierMonitor({ metrics, history, online }: { metrics: MonitorMetrics, history: MonitorHistoryPoint[], online: boolean }) {
  const { t, locale } = useT()
  const [mode, setMode] = useState<"latency" | "loss">("latency")
  return <Surface as="section" className="analytics-panel mt-5 mb-5 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("三网监控")}</h2>
      <div className="map-provider-switch !m-0" role="group" aria-label={t("监控指标")}>
        <button type="button" aria-pressed={mode === "latency"} onClick={() => setMode("latency")}>{t("延迟")}</button>
        <button type="button" aria-pressed={mode === "loss"} onClick={() => setMode("loss")}>{t("丢包率")}</button>
      </div>
    </div>
    <p className="mt-2 text-xs leading-6 text-gray-500">{t("从这台服务器探测电信、联通、移动代表节点；结果反映当前线路，不代表整个运营商。")}</p>
    {!online ? <p className="mt-2 text-xs text-amber-600">{t("服务器离线，以下为最后一次上报结果。")}</p> : null}
    <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {carriers.map(carrier => {
        const latency = pingLabel(metrics, carrier.key)
        const loss = metrics[`${carrier.key}_loss`]
        const status = metrics[`${carrier.key}_status`]
        return <Surface key={carrier.key} radius="medium" className="min-w-0 bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-600"><i className="size-2 rounded-full" style={{background:carrier.color}} />{t(carrier.label)}</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{latency || t(status === "timeout" ? "超时" : status === "unavailable" ? "探测不可用" : "未启用")}</div>
          <div className="mt-2 text-xs text-gray-500">{t("丢包率")} · {typeof loss === "number" ? `${loss.toFixed(1)}%` : "—"}</div>
          {typeof metrics[`${carrier.key}_target`] === "string" ? <div className="mt-1 break-all text-xs text-gray-400">{String(metrics[`${carrier.key}_target`])}</div> : null}
        </Surface>
      })}
    </div>
    <MonitorChart height={220} labels={history.map(row=>row.at)} series={carriers.map(carrier=>({id:carrier.key,label:carrier.label,color:carrier.color,values:history.map(row=>mode === "latency" ? row[carrier.key] : row[`${carrier.key}_loss`])}))} formatValue={n=>mode === "latency" ? `${n.toFixed(1)} ms` : `${n.toFixed(1)}%`} />
    <p className="mt-3 text-xs leading-6 text-gray-500">{typeof metrics.ping_checked_at === "string" ? `${t("最近探测")} · ${formatTimestamp(metrics.ping_checked_at, locale)}` : t("远程服务器未显示结果时，请用最新安装命令更新探针并启用三网监控。")}</p>
  </Surface>
}
