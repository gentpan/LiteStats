import { useT } from "~/lib/i18n"
import { useState } from "react"
import { numberShort } from "~/lib/format"

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
export type HeatCell = { dow: number, hour: number, value: number }

export function TrafficHeatmap({ cells }: { cells: HeatCell[] }) {
  const { t } = useT()
  const [selected, setSelected] = useState<{ dow: number, hour: number } | null>(null)
  const [chosenDay, setChosenDay] = useState<number | null>(null)
  const values = new Map(cells.map(cell => [`${cell.dow}-${cell.hour}`, cell.value]))
  const max = Math.max(1, ...cells.map(cell => cell.value))
  const dayTotals = DAYS.map((_, index) => cells.filter(cell => cell.dow === index + 1).reduce((sum, cell) => sum + cell.value, 0))
  const day = chosenDay ?? dayTotals.indexOf(Math.max(...dayTotals)) + 1
  const hours = Array.from({ length: 24 }, (_, hour) => values.get(`${day}-${hour}`) || 0)
  const hourMax = Math.max(1, ...hours)
  const hasData = hours.some(value => value > 0)
  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`
  const cellLabel = (dow: number, hour: number) => t("{0} {1} · {2} 访客", {0: t(DAYS[dow - 1]), 1: hourLabel(hour), 2: numberShort(values.get(`${dow}-${hour}`) || 0)})
  function selectCell(dow: number, hour: number) {
    setChosenDay(dow)
    setSelected({ dow, hour })
  }
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
            const label = cellLabel(index + 1, hour)
            return <button key={hour} type="button" className="squircle traffic-cell" aria-label={label} title={label}
              style={{background: value ? `color-mix(in srgb, var(--analytics-accent) ${Math.round(20 + 80 * Math.sqrt(value / max))}%, var(--analytics-tint))` : "var(--color-gray-100)"}}
              onMouseEnter={() => selectCell(index + 1, hour)} onFocus={() => selectCell(index + 1, hour)} onClick={() => selectCell(index + 1, hour)} />
          })}
        </div>)}
      </div>
      <div className="traffic-meta">
        <div className="traffic-caption" aria-live="polite">{selected ? cellLabel(selected.dow, selected.hour) : t("悬停或点选色块，查看访客数")}</div>
        <div className="traffic-legend"><span>{t("少")}</span>{[0,25,50,75,100].map(value => <i className="squircle" key={value} style={{background: `color-mix(in srgb, var(--analytics-accent) ${value}%, var(--color-gray-100))`}} />)}<span>{t("多")}</span></div>
      </div>
      <div className="traffic-hourly">
        <div className="traffic-hourly-heading">
          <h4>{t("小时分布")}</h4>
          <select className="squircle" aria-label={t("选择星期")} value={day} onChange={event => {
            setChosenDay(Number(event.target.value))
            setSelected(null)
          }}>
            {DAYS.map((name, index) => <option key={name} value={index + 1}>{t(name)}</option>)}
          </select>
        </div>
        <div className="traffic-hourly-chart" role="group" aria-label={t("{0}每小时访客", {0: t(DAYS[day - 1])})}>
          <div className="traffic-hourly-axis" aria-hidden="true"><span>{hasData ? numberShort(hourMax) : ""}</span><span>0</span></div>
          <div className="traffic-hourly-bars">
            {hours.map((value, hour) => <button key={hour} type="button" className="traffic-hourly-slot"
              aria-label={cellLabel(day, hour)} title={cellLabel(day, hour)}
              data-selected={selected?.dow === day && selected.hour === hour}
              onMouseEnter={() => selectCell(day, hour)} onFocus={() => selectCell(day, hour)} onClick={() => selectCell(day, hour)}>
              <span className="traffic-hourly-bar" style={{height: `${value / hourMax * 100}%`}} />
            </button>)}
            {!hasData ? <span className="traffic-hourly-empty">{t("暂无数据")}</span> : null}
          </div>
          <div className="traffic-hourly-ticks" aria-hidden="true">
            {hours.map((_, hour) => <span key={hour}>{hour % 6 === 0 || hour === 23 ? String(hour).padStart(2, "0") : ""}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}
