import { Surface } from "./Surface"
import { ActionButton } from "./ActionButton"
import { useT } from "~/lib/i18n"
import { useMemo, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  buildUptimeBlocks,
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
  const { t, locale } = useT()
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
  const pings = [["电信", "ping_ct"], ["联通", "ping_cu"], ["移动", "ping_cm"]].map(([label, key]) => ({ label, value: pingLabel(metrics, key) || t(metrics[`${key}_status`] === "timeout" ? "超时" : "—") }))
  const traffic = metricNum(metrics, "net_rx") + metricNum(metrics, "net_tx")

  return (
    <Surface as="article" className={`server-node ${online ? "" : "is-offline"}`}>
      <div className="server-node-head">
        <Link to="/servers/$id" params={{ id: server.id }} className="server-node-title">
          <span className={`server-node-dot ${online ? "is-on" : "is-off"}`} />
          <span className="truncate font-semibold text-gray-900">{server.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          {os ? <img src={osIconSrc(os)} alt={osIconName(os)} className="size-4" /> : null}
          {flag ? <img src={flag} alt={region} className="h-4 w-5 object-contain" /> : null}
        </div>
      </div>
      <Link to="/servers/$id" params={{ id: server.id }} className="relative block">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Meter label="CPU" value={cpu} display={`${cpu.toFixed(1)}%`} extra={`${load[0].toFixed(2)}, ${load[1].toFixed(2)}, ${load[2].toFixed(2)}`} />
          <Meter label={t("内存")} value={ramPct} display={`${ramPct.toFixed(1)}%`} extra={`${formatBytes(mbToBytes(ramUsed))} / ${formatBytes(mbToBytes(ramTotal))}`} />
          <Meter label={t("硬盘")} value={diskPct} display={`${diskPct.toFixed(1)}%`} extra={`${formatBytes(mbToBytes(diskUsed))} / ${formatBytes(mbToBytes(diskTotal))}`} />
          <Meter label={t("流量")} value={0} display="∞" extra={`${formatBytes(traffic)} / ∞`} />
        </div>
        {!online ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end pb-6">
            <span className="text-sm font-medium text-red-600">{t("离线")}</span>
          </div>
        ) : null}
        <div className={`mt-3 space-y-1.5 text-[11px] text-gray-500 ${online ? "" : "opacity-40"}`}>
          <Row label={t("速率")}>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title={t("上传速率: {0}", { 0: formatBps(metricNum(metrics, "net_out_speed")) })}>
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">↑</span>
              <span className="font-mono text-[11px] font-medium">{formatBps(metricNum(metrics, "net_out_speed"))}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400" title={t("下载速率: {0}", { 0: formatBps(metricNum(metrics, "net_in_speed")) })}>
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">↓</span>
              <span className="font-mono text-[11px] font-medium">{formatBps(metricNum(metrics, "net_in_speed"))}</span>
            </span>
          </Row>
          <UptimeMeter bootTime={metricNum(metrics, "boot_time")} lastSeenAt={server.last_seen_at} locale={locale} />
          <Row label={t("三网")}>
            {pings.map(item => <span key={item.label} className={pingTone(item.value)}>{t(item.label)} {item.value.replace(" ms", "ms")}</span>)}
          </Row>
        </div>
      </Link>
      {server.kind !== "local" ? (
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-3">
          {onInstall ? <ActionButton icon="code" className="btn-secondary" onClick={onInstall}>{t("安装命令")}</ActionButton> : null}
          {onRemove ? <ActionButton className="btn-danger" onClick={onRemove}>{t("删除")}</ActionButton> : null}
        </div>
      ) : null}
    </Surface>
  )
}

const TOTAL_BLOCKS = 20

function Meter({ label, value, display, extra }: { label: string, value: number, display: string, extra: string }) {
  const { t } = useT()
  const tone = usageTone(value)
  const clamped = Math.max(0, Math.min(100, value))
  const filledCount = clamped <= 0 ? 0 : Math.min(TOTAL_BLOCKS, Math.max(1, Math.round((clamped / 100) * TOTAL_BLOCKS)))

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-500">{t(label || "")}</span>
        <span className="text-gray-800">{display}</span>
      </div>
      <div
        className="flex w-full items-center gap-[2px]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${t(label || "")}: ${display}`}
        title={`${t(label || "")}: ${display}`}
      >
        {Array.from({ length: TOTAL_BLOCKS }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-[1.5px] transition-colors duration-150 ${
              i < filledCount ? barClass(tone) : "bg-gray-150"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 truncate text-[11px] text-gray-400">{extra}</p>
    </div>
  )
}

function Row({ label, children }: { label: string, children: ReactNode }) {
  const { t } = useT()
  return (
    <div className="flex items-center">
      <span>{t(label || "")}</span>
      <span className="mx-2 h-px flex-1 border-t border-dotted border-gray-200" />
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-gray-700">{children}</span>
    </div>
  )
}

function UptimeMeter({ bootTime, lastSeenAt, locale }: { bootTime: number, lastSeenAt: string | null, locale: string }) {
  const { t } = useT()
  const [blocksCount, setBlocksCount] = useState<30 | 60 | 90>(() => {
    if (typeof window === "undefined") return 30
    const saved = Number(localStorage.getItem("litestats_uptime_blocks"))
    return (saved === 30 || saved === 60 || saved === 90) ? saved : 30
  })

  const changeCount = (count: 30 | 60 | 90) => {
    setBlocksCount(count)
    try { localStorage.setItem("litestats_uptime_blocks", String(count)) } catch {}
  }

  const blocks = useMemo(
    () => buildUptimeBlocks(bootTime, lastSeenAt, blocksCount, locale),
    [bootTime, lastSeenAt, blocksCount, locale],
  )

  return (
    <div className="pt-0.5">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">{t("在线")}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{formatUptime(bootTime, locale)}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-sm bg-gray-100 p-0.5 text-[10px] text-gray-500 dark:bg-zinc-800" role="group" aria-label={t("时间跨度")}>
          {([30, 60, 90] as const).map((count) => (
            <button
              key={count}
              type="button"
              className={`rounded-xs px-1.5 py-0.5 font-medium transition-colors ${
                blocksCount === count
                  ? "bg-white text-gray-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                  : "hover:text-gray-800 dark:hover:text-gray-200"
              }`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                changeCount(count)
              }}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex w-full items-center gap-[1.5px]"
        role="group"
        aria-label={`${t("在线")}: ${formatUptime(bootTime, locale)}`}
      >
        {blocks.map((block, i) => {
          const isNearLeft = i < 3
          const isNearRight = i >= blocks.length - 3
          const tooltipAlignClass = isNearLeft
            ? "left-0 translate-x-0"
            : isNearRight
              ? "right-0 left-auto translate-x-0"
              : "left-1/2 -translate-x-1/2"
          const arrowAlignClass = isNearLeft
            ? "left-3"
            : isNearRight
              ? "right-3"
              : "left-1/2 -translate-x-1/2"

          return (
            <div key={block.key} className="group/block relative flex-1 py-0.5">
              <span
                className={`block h-2.5 w-full rounded-[1px] transition-colors duration-150 ${
                  block.status === "ok"
                    ? "bg-emerald-500"
                    : block.status === "down"
                      ? "bg-red-500"
                      : "bg-gray-150 dark:bg-zinc-800"
                }`}
              />
              <div className={`pointer-events-none absolute bottom-full z-30 mb-2 opacity-0 transition-opacity duration-150 group-hover/block:opacity-100 ${tooltipAlignClass}`}>
                <div className="whitespace-nowrap rounded-md bg-gray-900/95 px-2.5 py-1.5 text-center text-[10px] text-white shadow-xl backdrop-blur-xs dark:bg-gray-800">
                  <div className="font-semibold">{block.dateLabel}</div>
                  <div className={`mt-0.5 flex items-center justify-center gap-1.5 ${block.status === "ok" ? "text-emerald-400" : block.status === "down" ? "text-red-400" : "text-gray-400"}`}>
                    <span className={`inline-block size-1.5 rounded-full ${block.status === "ok" ? "bg-emerald-400" : block.status === "down" ? "bg-red-400" : "bg-gray-400"}`} />
                    <span>{block.statusLabel}</span>
                  </div>
                  {block.detail ? <div className="mt-0.5 text-[9px] text-gray-300">{block.detail}</div> : null}
                  <div className={`absolute top-full border-4 border-transparent border-t-gray-900/95 dark:border-t-gray-800 ${arrowAlignClass}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
