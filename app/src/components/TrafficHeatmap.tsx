import { useT } from "~/lib/i18n"
import { useState } from "react"
import { numberShort } from "~/lib/format"

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
export type HeatCell = { dow: number, hour: number, value: number }

export function TrafficHeatmap({ cells }: { cells: HeatCell[] }) {
  const { t } = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const values = new Map(cells.map(cell => [`${cell.dow}-${cell.hour}`, cell.value]))
  const max = Math.max(1, ...cells.map(cell => cell.value))
  return (
    <div className="traffic-panel">
      <div className="analytics-heading"><h3>{t("访问时段")}</h3><span>{t("星期 × 小时")}</span></div>
      <p className="analytics-description">{t("颜色越深，代表这个时段的访客越多。")}</p>
      <div className="traffic-grid">
        <span />
        {Array.from({length: 24}, (_, hour) => <span className="traffic-hour" key={hour}>{hour % 6 === 0 ? `${String(hour).padStart(2, "0")}` : ""}</span>)}
        {DAYS.map((day, index) => <div className="traffic-day" key={day}>
          <span className="traffic-day-label">{t(day)}</span>
          {Array.from({length: 24}, (_, hour) => {
            const value = values.get(`${index + 1}-${hour}`) || 0
            const label = t("{0} {1} · {2} 访客", {0: t(day), 1: `${String(hour).padStart(2, "0")}:00`, 2: numberShort(value)})
            return <button key={hour} type="button" className="traffic-cell" aria-label={label} title={label}
              style={{background: value ? `color-mix(in srgb, var(--analytics-accent) ${Math.round(20 + 80 * Math.sqrt(value / max))}%, var(--analytics-tint))` : "var(--color-gray-100)"}}
              onMouseEnter={() => setSelected(label)} onFocus={() => setSelected(label)} onClick={() => setSelected(label)} />
          })}
        </div>)}
      </div>
      <div className="traffic-caption" aria-live="polite">{selected || t("悬停或点选色块，查看访客数")}</div>
      <div className="traffic-legend"><span>{t("少")}</span>{[0,25,50,75,100].map(value => <i key={value} style={{background: `color-mix(in srgb, var(--analytics-accent) ${value}%, var(--color-gray-100))`}} />)}<span>{t("多")}</span></div>
    </div>
  )
}
