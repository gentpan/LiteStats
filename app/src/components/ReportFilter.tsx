import { useId, useState } from "react"
import { useT } from "~/lib/i18n"
import { reportSearchText, reportValueLabel, resolveReportFilter } from "~/lib/report-values"
import { ReportValue } from "./ReportValue"

type Option = {name: string; label?: string}

export function ReportFilter({kind, options, initialValue, onApply}: {
  kind: string
  options: Option[]
  initialValue: string
  onApply: (name: string) => void
}) {
  const {t, locale} = useT()
  const [entered, setEntered] = useState(initialValue)
  // Selection is independent of its translated label, including colliding legacy names.
  const [selected, setSelected] = useState<string | null>(initialValue || null)
  const headingId = useId()
  const selectedOption = selected === null ? undefined : options.find(option => option.name === selected)
  const displayValue = selected === null ? entered : reportValueLabel(kind, selected, locale, selectedOption?.label)
  const needle = selected === null ? entered.trim().toLowerCase() : ""
  const matching = options.filter(option => !needle || reportSearchText(kind, option, locale).toLowerCase().includes(needle))
  const apply = () => {
    if (!displayValue.trim()) return
    const value = selected ?? resolveReportFilter(kind, entered, options, locale)
    onApply(value)
  }

  return <div className="report-filter">
    <div className="dash-filter-entry">
      <input className="squircle input" type="search" autoComplete="off" aria-label={t("输入筛选值")} placeholder={t("输入筛选值")} value={displayValue}
        onChange={event=>{setEntered(event.target.value);setSelected(null)}}
        onKeyDown={event=>{if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {event.preventDefault();apply()}}}/>
      <button type="button" className="squircle btn btn-primary" disabled={!displayValue.trim()} onClick={apply}>{t("应用")}</button>
    </div>
    {matching.length ? <div className="report-filter-options" role="group" aria-labelledby={headingId}>
      <span id={headingId} className="sr-only">{t("筛选候选值")}</span>
      {matching.map(option=>{
        const label = reportValueLabel(kind, option.name, locale, option.label)
        const ambiguous = options.filter(other => reportValueLabel(kind, other.name, locale, other.label) === label).length > 1
        return <button key={option.name} type="button" className="squircle control-menu-item report-filter-option" aria-pressed={selected === option.name} data-selected={selected === option.name}
          onClick={()=>{setEntered(option.name);setSelected(option.name)}}>
          <ReportValue kind={kind} name={option.name} label={option.label} wrap/>
          {ambiguous ? <small className="report-filter-raw">{option.name || "(empty)"}</small> : null}
        </button>
      })}
    </div> : null}
  </div>
}
