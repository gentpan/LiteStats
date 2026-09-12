import { useEffect, useMemo, useRef, useState } from "react"
import { formatClock, formatDayLong, formatDayShort, formatDuration, formatMonthYYYY, numberShort } from "~/lib/format"
import type { Interval } from "~/lib/range"
import { INTERVAL_VIEW } from "~/lib/range"
import type { MetricKey } from "~/lib/ch"

type Point = { date: string, value: number }

const METRIC_LABEL: Record<MetricKey, string> = {
  visitors: "独立访客",
  visits: "总会话",
  pageviews: "总浏览量",
  views_per_visit: "每次访问浏览量",
  bounce_rate: "跳出率",
  visit_duration: "访问时长",
}

const HEIGHT = 368
const MARGIN = { top: 16, right: 4, bottom: 32, left: 16 }

function formatMetric(metric: MetricKey, value: number) {
  if (metric === "bounce_rate") return `${Math.round(value)}%`
  if (metric === "visit_duration") return formatDuration(value)
  if (metric === "views_per_visit") return value.toFixed(2)
  return numberShort(value)
}

function niceStep(range: number) {
  if (range <= 0) return 1
  const exp = Math.floor(Math.log10(range))
  const frac = range / 10 ** exp
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * 10 ** exp
}

function integerScale(maxValue: number, metric: MetricKey) {
  if (metric === "bounce_rate") {
    return { max: 100, ticks: [0, 25, 50, 75, 100] }
  }
  const raw = Math.max(maxValue, 1)
  const rough = niceStep(raw / 4)
  const step = Math.max(1, Math.round(rough))
  const max = Math.ceil(raw / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= max + 1e-6; v += step) ticks.push(Math.round(v))
  return { max, ticks }
}

function formatAxisTick(metric: MetricKey, value: number) {
  const n = Math.round(value)
  if (metric === "bounce_rate") return `${n}%`
  if (metric === "visit_duration") return formatDuration(n)
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}M`
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`
  return String(n)
}

function axisLabel(date: string, interval: Interval, withYear: boolean) {
  if (interval === "month") return formatMonthYYYY(date)
  if (interval === "hour") return formatClock(date)
  if (interval === "minute") return formatClock(date, true)
  return formatDayShort(date, withYear)
}

function tooltipLabel(date: string, interval: Interval, withYear: boolean, index: number, total: number, realtime: boolean) {
  if (interval === "month") return formatMonthYYYY(date)
  if (interval === "week") return `Week of ${formatDayShort(date, withYear)}`
  if (interval === "day") return formatDayLong(date, withYear)
  if (interval === "minute" && realtime) {
    const ago = total - index
    return ago === 1 ? "1 minute ago" : `${ago} minutes ago`
  }
  if (interval === "hour" || interval === "minute") {
    return `${formatDayLong(date, withYear)}, ${formatClock(date, interval === "minute")}`
  }
  return formatDayLong(date, withYear)
}

export function TrendChart({
  points,
  metric = "visitors",
  interval = "day",
  realtime = false,
  onZoom,
}: {
  points: Point[]
  metric?: MetricKey
  interval?: Interval
  realtime?: boolean
  onZoom?: (date: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<{ index: number, x: number, persistent: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 800))
    ro.observe(el)
    setWidth(el.clientWidth || 800)
    return () => ro.disconnect()
  }, [])

  const years = new Set(points.map((p) => p.date.slice(0, 4)))
  const withYear = years.size > 1
  const canZoom = (interval === "day" || interval === "month") && points.length > 1 && !!onZoom

  const layout = useMemo(() => {
    const values = points.map((p) => p.value)
    const scale = integerScale(Math.max(0, ...values), metric)
    const yMax = scale.max
    const yTickVals = scale.ticks
    const left = Math.max(MARGIN.left, Math.max(...yTickVals.map((v) => formatAxisTick(metric, v).length), 1) * 7 + 12)
    const innerW = Math.max(1, width - left - MARGIN.right)
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
    const x = (i: number) => left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ")
    const area = points.length
      ? `${line} L${x(points.length - 1)},${MARGIN.top + innerH} L${x(0)},${MARGIN.top + innerH} Z`
      : ""
    const xTickCount = Math.min(8, points.length)
    const xTicks = points.length
      ? Array.from({ length: xTickCount }, (_, i) => {
          const index = xTickCount === 1 ? 0 : Math.round((i * (points.length - 1)) / (xTickCount - 1))
          return { index, x: x(index), label: axisLabel(points[index].date, interval, withYear) }
        })
      : []
    return { yMax, left, innerW, innerH, x, y, line, area, xTicks, yTickVals }
  }, [points, width, metric, interval, withYear])

  function indexFromClientX(clientX: number) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || points.length === 0) return 0
    const px = clientX - rect.left
    const t = (px - layout.left) / layout.innerW
    return Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1))))
  }

  const selected = hover ? points[hover.index] : null
  const tooltipX = hover ? Math.min(Math.max(hover.x + 12, 8), width - 220) : 0

  return (
    <div
      ref={box}
      className="relative mt-4 mb-3 w-full"
      style={{ height: HEIGHT }}
      onPointerMove={(e) => {
        if (hover?.persistent) return
        const index = indexFromClientX(e.clientX)
        setHover({ index, x: layout.x(index), persistent: false })
      }}
      onPointerLeave={() => {
        if (!hover?.persistent) setHover(null)
      }}
      onClick={() => {
        if (!hover || !canZoom) return
        onZoom?.(points[hover.index].date)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        const index = indexFromClientX(e.clientX)
        setHover({ index, x: layout.x(index), persistent: true })
      }}
    >
      {points.length === 0 ? (
        <p className="flex h-full items-center justify-center text-sm font-medium text-gray-500">暂无数据</p>
      ) : (
        <svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="overflow-visible">
          <defs>
            <linearGradient id="primary-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {layout.yTickVals.map((v, i) => (
            <g key={i}>
              <line
                x1={layout.left}
                x2={width - MARGIN.right}
                y1={layout.y(v)}
                y2={layout.y(v)}
                stroke={i === 0 ? "#d4d4d8" : "#ececee"}
              />
              <text x={layout.left - 8} y={layout.y(v) + 4} textAnchor="end" className="fill-zinc-500" fontSize="12">
                {formatAxisTick(metric, v)}
              </text>
            </g>
          ))}
          <line x1={layout.left} x2={width - MARGIN.right} y1={HEIGHT - MARGIN.bottom} y2={HEIGHT - MARGIN.bottom} stroke="#d4d4d8" />
          {layout.xTicks.map((tick) => (
            <g key={tick.index}>
              <line x1={tick.x} x2={tick.x} y1={HEIGHT - MARGIN.bottom} y2={HEIGHT - MARGIN.bottom + 4} stroke="#d4d4d8" />
              <text x={tick.x} y={HEIGHT - 10} textAnchor="middle" className="fill-zinc-500" fontSize="12">
                {tick.label}
              </text>
            </g>
          ))}
          <path d={layout.area} fill="url(#primary-gradient)" />
          <path d={layout.line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover ? (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={MARGIN.top - 4}
                y2={HEIGHT - MARGIN.bottom + 4}
                stroke="#c7d2fe"
                strokeWidth="1"
              />
              <circle cx={hover.x} cy={layout.y(points[hover.index].value)} r="3" fill="#6366f1" />
            </>
          ) : null}
        </svg>
      )}
      {selected && hover ? (
        <div
          className={`absolute bg-gray-800 py-3 px-4 rounded-md shadow shadow-gray-200 w-max max-w-[220px] sm:max-w-[300px] ${hover.persistent ? "" : "pointer-events-none"}`}
          style={{ left: tooltipX, top: 8 }}
        >
          <aside className="flex flex-col gap-2 text-sm font-normal text-gray-100">
            <div className="flex items-center justify-between rounded-sm">
              <div className="mr-4 text-xs font-semibold uppercase whitespace-nowrap">{METRIC_LABEL[metric]}</div>
            </div>
            <div className="flex flex-row items-center justify-between">
              <div className="mr-4 flex items-center">
                <div className="mr-2 size-2 flex-none rounded-full bg-indigo-400" />
                <div className="whitespace-nowrap">
                  {tooltipLabel(selected.date, interval, withYear, hover.index, points.length, realtime)}
                </div>
              </div>
              <div className="font-bold whitespace-nowrap">{formatMetric(metric, selected.value)}</div>
            </div>
            <hr className="my-1 border-gray-600" />
            <div className="flex flex-col gap-y-0.5">
              {canZoom ? <div className="text-xs text-gray-300">点击查看{INTERVAL_VIEW[interval]}</div> : null}
              <div className="text-xs text-gray-300">{hover.persistent ? "点击空白处关闭" : "右键固定提示"}</div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
