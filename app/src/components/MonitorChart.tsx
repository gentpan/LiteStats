import { useEffect, useId, useMemo, useRef, useState } from "react"

export type ChartSeries = {
  id: string
  label: string
  color: string
  values: Array<number | null>
}

const DEFAULT_HEIGHT = 196
const MARGIN = { top: 12, right: 8, bottom: 28, left: 16 }

function niceStep(range: number) {
  if (range <= 0) return 1
  const exp = Math.floor(Math.log10(range))
  const frac = range / 10 ** exp
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * 10 ** exp
}

function scale(maxValue: number) {
  const raw = Math.max(maxValue, 1)
  const step = Math.max(niceStep(raw / 4), 0.01)
  const max = Math.ceil(raw / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)))
  return { max, ticks }
}

function formatTick(value: number, format: (n: number) => string) {
  return format(value)
}

export function MonitorChart({
  labels,
  series,
  formatValue = (n) => String(Math.round(n * 10) / 10),
  height = DEFAULT_HEIGHT,
}: {
  labels: string[]
  series: ChartSeries[]
  formatValue?: (value: number) => string
  height?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const gid = useId().replace(/:/g, "")
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 640))
    ro.observe(el)
    setWidth(el.clientWidth || 640)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(() => {
    const values = series.flatMap((s) => s.values.filter((v): v is number => v != null && Number.isFinite(v)))
    const { max, ticks } = scale(Math.max(0, ...values))
    const left = Math.max(MARGIN.left, Math.max(...ticks.map((v) => formatTick(v, formatValue).length), 1) * 7 + 10)
    const innerW = Math.max(1, width - left - MARGIN.right)
    const innerH = height - MARGIN.top - MARGIN.bottom
    const x = (i: number) => left + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW)
    const y = (v: number) => MARGIN.top + innerH - (v / max) * innerH
    const paths = series.map((item) => {
      const pts = item.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
      const line = pts.reduce((acc, point, i) => {
        if (!point) return acc
        const prev = i > 0 && pts[i - 1]
        return acc + (prev ? ` L${point}` : `${acc ? " " : ""}M${point}`)
      }, "")
      const first = pts.find(Boolean)
      const last = [...pts].reverse().find(Boolean)
      const area = first && last && line ? `${line} L${last.split(",")[0]},${MARGIN.top + innerH} L${first.split(",")[0]},${MARGIN.top + innerH} Z` : ""
      return { line, area }
    })
    const xTickCount = Math.min(6, labels.length)
    const xTicks = labels.length
      ? Array.from({ length: xTickCount }, (_, i) => {
          const index = xTickCount === 1 ? 0 : Math.round((i * (labels.length - 1)) / (xTickCount - 1))
          return { index, x: x(index), label: formatChartTime(labels[index]) }
        })
      : []
    return { max, left, innerW, innerH, x, y, paths, xTicks, ticks }
  }, [labels, series, width, formatValue, height])

  function indexFromX(clientX: number) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || labels.length === 0) return 0
    const t = (clientX - rect.left - layout.left) / layout.innerW
    return Math.max(0, Math.min(labels.length - 1, Math.round(t * (labels.length - 1))))
  }

  const tipX = hover == null ? 0 : Math.min(Math.max(layout.x(hover) + 12, 8), width - 220)

  return (
    <div
      ref={box}
      className="relative w-full"
      style={{ height }}
      onPointerMove={(e) => setHover(indexFromX(e.clientX))}
      onPointerLeave={() => setHover(null)}
    >
      {labels.length === 0 ? (
        <p className="flex h-full items-center justify-center text-sm text-gray-500">这段时间还没有样本</p>
      ) : (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.id} id={`${gid}-${item.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {layout.ticks.map((v, i) => (
            <g key={v}>
              <line x1={layout.left} x2={width - MARGIN.right} y1={layout.y(v)} y2={layout.y(v)} stroke={i === 0 ? "#d4d4d8" : "#ececee"} />
              <text x={layout.left - 8} y={layout.y(v) + 4} textAnchor="end" className="fill-zinc-500" fontSize="11">
                {formatTick(v, formatValue)}
              </text>
            </g>
          ))}
          {layout.xTicks.map((tick) => (
            <text key={tick.index} x={tick.x} y={height - 8} textAnchor="middle" className="fill-zinc-500" fontSize="11">
              {tick.label}
            </text>
          ))}
          {series.map((item, i) => (
            <g key={item.id}>
              {layout.paths[i].area ? <path d={layout.paths[i].area} fill={`url(#${gid}-${item.id})`} /> : null}
              {layout.paths[i].line ? <path d={layout.paths[i].line} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
            </g>
          ))}
          {hover != null ? (
            <line x1={layout.x(hover)} x2={layout.x(hover)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke="#c7d2fe" />
          ) : null}
        </svg>
      )}
      {hover != null && labels[hover] ? (
        <div className="pointer-events-none absolute rounded-md bg-gray-800 px-3 py-2 text-xs text-gray-100 shadow" style={{ left: tipX, top: 6 }}>
          <div className="mb-1 font-medium">{new Date(labels[hover]).toLocaleString()}</div>
          {series.map((item) => {
            const value = item.values[hover]
            return (
              <div key={item.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
                <span className="font-semibold">{value == null ? "—" : formatValue(value)}</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function formatChartTime(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ""
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
