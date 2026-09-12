import { useState } from "react"
import { numberShort } from "~/lib/format"

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

export type HeatCell = { dow: number, hour: number, value: number }

function hourLabel(hour: number) {
  if (hour === 0) return "12上午"
  if (hour < 12) return `${hour}上午`
  if (hour === 12) return "12下午"
  return `${hour - 12}下午`
}

function clockLabel(hour: number) {
  const period = hour < 12 ? "上午" : "下午"
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${period} ${h} 点`
}

export function TrafficHeatmap({ cells }: { cells: HeatCell[] }) {
  const map = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.value]))
  const max = Math.max(1, ...cells.map((c) => c.value), 0)
  const [tip, setTip] = useState<{ x: number, y: number, text: string } | null>(null)

  return (
    <div className="relative flex h-full min-h-[24rem] flex-col">
      <div className="mb-2 flex items-center justify-between border-b border-gray-200 pb-3">
        <h3 className="text-sm font-bold text-gray-900">流量</h3>
      </div>
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: "2.6rem repeat(7, minmax(0, 1fr))",
          gridTemplateRows: `1.15rem repeat(24, minmax(0, 1fr))`,
        }}
      >
        <div />
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
        ))}
        {Array.from({ length: 24 }, (_, hour) => (
          <HourRow
            key={hour}
            hour={hour}
            map={map}
            max={max}
            onTip={setTip}
          />
        ))}
      </div>
      {tip ? (
        <div
          className="pointer-events-none absolute z-20 rounded-sm bg-white px-2 py-1 text-xs shadow shadow-gray-200"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  )
}

function HourRow({
  hour,
  map,
  max,
  onTip,
}: {
  hour: number
  map: Map<string, number>
  max: number
  onTip: (tip: { x: number, y: number, text: string } | null) => void
}) {
  return (
    <>
      <div className="pr-1 text-right text-[10px] leading-[1.1] text-gray-400">{hourLabel(hour)}</div>
      {DAYS.map((_, i) => {
        const dow = i + 1
        const value = map.get(`${dow}-${hour}`) || 0
        const t = value / max
        const size = value ? 18 + 82 * Math.sqrt(t) : 18
        return (
          <div
            key={`${dow}-${hour}`}
            className="relative flex items-center justify-center"
            onMouseEnter={(e) => {
              const box = (e.currentTarget.closest(".relative") as HTMLElement | null)?.getBoundingClientRect()
              const cell = e.currentTarget.getBoundingClientRect()
              onTip({
                x: cell.left - (box?.left || 0) + 8,
                y: cell.top - (box?.top || 0) - 28,
                text: `${DAYS[i]} ${clockLabel(hour)} · ${numberShort(value)} 访客`,
              })
            }}
            onMouseLeave={() => onTip(null)}
          >
            <span
              className="block rounded-full"
              style={{
                width: `${size}%`,
                aspectRatio: "1",
                maxWidth: 14,
                background: value ? `rgb(79 70 229 / ${0.22 + 0.78 * t})` : "rgb(226 232 240)",
              }}
            />
          </div>
        )
      })}
    </>
  )
}
