import { UIIcon, BrandIcon, type BrandName } from "./UIIcon"
import { Surface } from "~/components/Surface"
import { useT } from "~/lib/i18n"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { CountryFlag, RowIcon, type RowIconKind } from "~/components/icons"
import { numberShort, percentShort } from "~/lib/format"
import { delta } from "~/lib/range"

const BAR: Record<string, string> = {
  source: "bg-blue-50 group-hover/row:bg-blue-100",
  channel: "bg-blue-50 group-hover/row:bg-blue-100",
  campaign: "bg-blue-50 group-hover/row:bg-blue-100",
  page: "bg-orange-50 group-hover/row:bg-orange-100",
  country: "bg-orange-50 group-hover/row:bg-orange-100",
  region: "bg-orange-50 group-hover/row:bg-orange-100",
  city: "bg-orange-50 group-hover/row:bg-orange-100",
  browser: "bg-green-50 group-hover/row:bg-green-100",
  os: "bg-green-50 group-hover/row:bg-green-100",
  device: "bg-green-50 group-hover/row:bg-green-100",
  language: "bg-green-50 group-hover/row:bg-green-100",
  screen: "bg-green-50 group-hover/row:bg-green-100",
  title: "bg-orange-50 group-hover/row:bg-orange-100",
  query: "bg-orange-50 group-hover/row:bg-orange-100",
  keyword: "bg-blue-50 group-hover/row:bg-blue-100",
  goal: "bg-red-50 group-hover/row:bg-red-100",
}

export { formatDuration } from "~/lib/format"

export function Card({
  label,
  value,
  suffix = "",
  prev,
  selected,
  onSelect,
  text,
  index = 0,
  invertChange = false,
  icon,
}: {
  label: string
  value: number
  suffix?: string
  prev?: number
  selected?: boolean
  onSelect?: () => void
  text?: string
  index?: number
  invertChange?: boolean
  icon?: string
}) {
  const { t } = useT()
  const d = delta(value, prev)
  const up = invertChange ? (d ? d.diff < 0 : false) : (d ? d.diff > 0 : false)
  const down = invertChange ? (d ? d.diff > 0 : false) : (d ? d.diff < 0 : false)
  return (
    <div className={`metric-item group my-2 w-1/2 select-none px-4 lg:w-auto lg:flex-1 ${index > 0 ? "lg:border-l border-gray-200" : ""} ${index % 2 === 0 ? "border-r lg:border-r-0" : ""}`}>
      <button
        type="button"
        aria-pressed={selected}
        disabled={!onSelect}
        onClick={onSelect}
        className={`-mx-2 flex w-full flex-col gap-y-1 rounded-md p-2 text-left ${onSelect ? "cursor-pointer hover:bg-gray-100/80" : "cursor-default"} ${selected ? "bg-gray-100/70" : ""}`}
      >
        <div className={`flex w-fit text-xs uppercase whitespace-nowrap ${selected ? "font-bold tracking-[-.01em] text-gray-900" : "font-semibold text-gray-500 group-hover:text-gray-900"}`}>
          {t(label || "")}
        </div>
        {icon ? <UIIcon name={icon} className="metric-watermark" /> : null}
        <span className="flex items-baseline whitespace-nowrap">
          <p className="text-[1.2rem] font-semibold text-gray-900">
            {text ?? `${numberShort(value)}${suffix}`}
          </p>
          {d ? (
            <span className="ml-2 text-xs font-medium text-gray-500">
              {d.diff !== 0 ? (
                <svg className={`mb-0.5 mr-0.5 inline-block size-2.5 ${up ? "text-green-500" : down ? "text-red-500" : "text-gray-400"}`} viewBox="0 0 24 24" fill="currentColor">
                  {d.diff > 0
                    ? <path fillRule="evenodd" d="M8.25 3.75H19.5v11.25a.75.75 0 0 1-1.5 0V6.31L5.03 19.28a.75.75 0 0 1-1.06-1.06L16.69 5.25H8.25a.75.75 0 0 1 0-1.5Z" clipRule="evenodd" />
                    : <path fillRule="evenodd" d="M8.25 20.25H19.5V9a.75.75 0 0 0-1.5 0v8.69L5.03 4.72a.75.75 0 0 0-1.06 1.06L16.69 18.75H8.25a.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />}
                </svg>
              ) : null}
              {Math.abs(d.pct)}%
            </span>
          ) : null}
        </span>
      </button>
    </div>
  )
}

const DIM_LABEL: Record<string, string> = {
  source: "来源",
  channel: "渠道",
  campaign: "活动",
  page: "页面",
  country: "国家/地区",
  region: "地区",
  city: "城市",
  browser: "浏览器",
  os: "操作系统",
  device: "设备",
  language: "语言",
  screen: "屏幕",
  title: "标题",
  query: "查询",
  keyword: "搜索词",
  goal: "目标",
  hostname: "主机名",
}

const MAX_ITEMS = 9
const ROW_HEIGHT = 32
const ROW_GAP = 4
const LIST_MIN_HEIGHT = 356
const DATA_HEIGHT = (ROW_HEIGHT + ROW_GAP) * (MAX_ITEMS - 1) + ROW_HEIGHT

export type ListRow = {
  name: string
  value: number
  label?: string
  href?: string
  code?: string
  metrics?: Record<string, number>
}

export type ListColumn = {
  key: string
  label: string
  width?: string
  format?: (n: number, row: ListRow) => string
}

export function List({
  title,
  rows,
  onPick,
  kind,
  plain,
  columns,
  maxItems = MAX_ITEMS,
  compact = false,
  paginate = false,
}: {
  title?: string
  rows: ListRow[]
  onPick?: (name: string) => void
  kind?: RowIconKind | "page" | "goal" | "channel" | "campaign" | "region" | "city" | "hostname" | "title" | "query" | "language" | "screen" | "keyword"
  plain?: boolean
  columns?: ListColumn[]
  maxItems?: number
  compact?: boolean
  paginate?: boolean
}) {
  const { t } = useT()
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / 10))
  const currentPage = Math.min(page, pages)
  const rowIdentity = rows.map(row=>row.name).join("\u0000")
  useEffect(()=>setPage(1),[rowIdentity])
  const shown = paginate ? rows.slice((currentPage - 1) * 10, currentPage * 10) : maxItems > 0 ? rows.slice(0, maxItems) : rows
  const max = Math.max(1, ...(paginate ? rows : shown).map((r) => r.value))
  const total = rows.reduce((n, r) => n + r.value, 0) || 1
  const bar = BAR[kind || ""] || "bg-indigo-50 group-hover/row:bg-indigo-100"
  const iconKind = kind === "source" || kind === "country" || kind === "browser" || kind === "os" || kind === "device" ? kind : undefined
  const flagKind = kind === "region" || kind === "city"
  const extraCols = columns || []
  const bundlePct = extraCols.length === 0

  const emptyMin = maxItems > 0 && !compact ? LIST_MIN_HEIGHT : 160
  const body = shown.length === 0 ? (
    <div className="flex h-full w-full flex-col justify-center" style={{ minHeight: emptyMin }}>
      <div className="mx-auto font-medium text-gray-500">{t("暂无数据")}</div>
    </div>
  ) : (
    <div className="flex h-full flex-col">
      <div className="flex w-full items-center pt-3 text-xs font-medium text-gray-500" style={{ height: ROW_HEIGHT }}>
        <div className="w-full min-w-0 grow truncate">{t(DIM_LABEL[kind || ""] || title || "")}</div>
        {bundlePct ? (
          <div className="w-32 min-w-32 shrink-0 text-right">{t("访客")}</div>
        ) : extraCols.map((col) => (
          <div key={col.key} className={`${col.width || "w-16 min-w-16 md:w-[5.5rem] md:min-w-[5.5rem]"} shrink-0 text-right`}>
            {t(col.label)}
          </div>
        ))}
      </div>
      <div className="group/report" style={maxItems > 0 && !compact ? { minHeight: DATA_HEIGHT } : undefined}>
        {shown.map((r) => {
          const width = Math.max(2, (r.value / max) * 100)
          const pct = (r.value / total) * 100
          return (
            <div key={r.name} style={{ minHeight: ROW_HEIGHT }}>
              <div
                className={`group/row flex w-full items-center rounded-sm hover:bg-gray-100/60 ${onPick ? "cursor-pointer" : ""}`}
                style={{ marginTop: ROW_GAP }}
                onClick={onPick ? () => onPick(r.name) : undefined}
                role={onPick ? "button" : undefined}
              >
                <div className="w-full min-w-0 grow md:truncate">
                  <div className="relative h-full w-full">
                    <div className={`absolute top-0 left-0 h-full rounded-sm ${bar}`} style={{ width: `${width}%` }} />
                    <div className="relative z-9 break-all px-2 py-1.5 text-sm">
                      <div className="flex w-full items-center justify-start gap-x-1.5">
                        <span className="flex w-full max-w-max items-center gap-x-2 md:overflow-hidden">
                          {flagKind && r.code ? <CountryFlag code={r.code} /> : <RowIcon kind={iconKind} name={r.name} />}
                          <span className="w-full md:truncate group-hover/row:underline">{r.label || r.name}</span>
                        </span>
                        {r.href ? (
                          <a
                            href={r.href}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t("在新标签打开")}
                            className="invisible md:group-hover/row:visible"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="mb-0.5 inline size-3.5 text-gray-600 hover:text-gray-800">
                              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M12 12l9-9-.303.303M14 3h7v7" />
                            </svg>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                {bundlePct ? (
                  <div className="w-32 min-w-32 shrink-0 text-right text-sm font-medium text-gray-800">
                    <div className="flex w-full">
                      <div className="w-1/2">
                        <span className="block w-full translate-x-[100%] tabular-nums transition-all duration-150 md:group-hover/report:translate-x-0">{numberShort(r.value)}</span>
                      </div>
                      <div className="w-1/2">
                        <span className="block w-full translate-x-[100%] text-gray-500 tabular-nums opacity-0 transition-all duration-150 md:group-hover/report:translate-x-0 md:group-hover/report:opacity-100">{percentShort(pct)}</span>
                      </div>
                    </div>
                  </div>
                ) : extraCols.map((col) => (
                  <div key={col.key} className={`${col.width || "w-16 min-w-16 md:w-[5.5rem] md:min-w-[5.5rem]"} shrink-0 text-right text-sm font-medium text-gray-800 tabular-nums`}>
                    {col.format ? col.format(r.metrics?.[col.key] ?? r.value, r) : numberShort(r.metrics?.[col.key] ?? r.value)}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
  if (plain) return <>{body}{paginate && rows.length > 10 ? <nav className="report-list-pagination" aria-label={t("分页")}><span>{t("每页 10 条")} · {rows.length}</span><div><button type="button" disabled={currentPage <= 1} onClick={()=>setPage(currentPage-1)}>{t("上一页")}</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={()=>setPage(currentPage+1)}>{t("下一页")}</button></div></nav> : null}</>
  return (
    <Surface as="section" className="relative flex min-h-[430px] w-full flex-col overflow-x-hidden bg-white p-5 shadow-sm md:h-[27.25rem] md:min-h-[initial]">
      {title ? <h2 className="mb-3 text-xs font-bold uppercase tracking-[-.01em] text-gray-900">{t(title || "")}</h2> : null}
      {body}
    </Surface>
  )
}

export type ReportTab = {
  id: string
  label: string
  dropdown?: Array<{ id: string, label: string, onSelect?: () => void, selected?: boolean }>
}

function MoreLinkIcon() {
  return (
    <svg className="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  )
}

export type DetailsSpec = {
  title: string
  kind?: RowIconKind | "page" | "goal" | "channel" | "campaign" | "region" | "city" | "hostname" | "title" | "query" | "language" | "screen" | "keyword"
  rows: ListRow[]
  columns?: ListColumn[]
  onPick?: (name: string) => void
}

function DetailsModal({
  spec,
  onClose,
}: {
  spec: DetailsSpec
  onClose: () => void
}) {
  const { t } = useT()
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return spec.rows
    return spec.rows.filter((r) => `${r.label || ""} ${r.name}`.toLowerCase().includes(needle))
  }, [q, spec.rows])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="modal is-open">
      <div className="fixed inset-0 z-[999] overflow-y-auto bg-black/60" onClick={onClose}>
        <div className="flex min-h-full w-full items-start justify-center p-4 sm:p-8 md:p-12">
          <div className="flex max-h-[calc(100dvh-4rem)] w-full max-w-[880px] flex-col overflow-hidden rounded-lg bg-white p-3 shadow-2xl md:px-6 md:py-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-gray-900">{t(spec.title)}</h1>
              <button type="button" className="text-gray-400 hover:text-gray-600" aria-label={t("关闭")} onClick={onClose}>
                <svg className="size-[1.125rem]" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("搜索")}
              className="mb-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <List plain maxItems={0} kind={spec.kind} rows={filtered} columns={spec.columns} onPick={spec.onPick ? (name) => { spec.onPick?.(name); onClose() } : undefined} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ReportCard({
  title,
  tabs = [],
  active,
  onChange,
  more = true,
  extra,
  details,
  children,
  className = "",
}: {
  title?: string
  tabs?: ReportTab[]
  active?: string
  onChange?: (id: string) => void
  more?: boolean
  extra?: ReactNode
  details?: DetailsSpec
  children: ReactNode
  className?: string
}) {
  const { t } = useT()
  const [open, setOpen] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const showMore = more && !!details?.rows.length

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-report-dropdown]")) setOpen(null)
    }
    window.addEventListener("mousedown", onDoc)
    return () => window.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <Surface as="section" className={`relative flex min-h-[430px] w-full flex-col bg-white p-5 shadow-sm md:h-[27.25rem] md:min-h-[initial] ${className.includes("overflow") ? "" : "overflow-x-hidden"} ${className}`}>
      <div className="flex w-full justify-between border-b border-gray-200">
        {title ? <h3 className="pb-3 text-sm font-bold text-gray-900">{t(title || "")}</h3> : null}
        {tabs.length ? (
          <div className="flex items-baseline gap-x-3.5 text-xs font-medium text-gray-500">
            {tabs.map((reportTab) => {
              const selected = reportTab.dropdown
                ? reportTab.id === active || reportTab.dropdown.some((d) => d.id === active)
                : reportTab.id === active
              const label = reportTab.dropdown?.find((d) => d.id === active)?.label || reportTab.label
              if (reportTab.dropdown) {
                return (
                  <div key={reportTab.id} className="relative" data-report-dropdown>
                    <div className={`-mb-px pb-4 ${selected ? "border-b-2 border-gray-900" : ""}`}>
                      <button
                        type="button"
                        className="group/tab relative inline-flex items-center rounded-sm"
                        onClick={() => setOpen(open === reportTab.id ? null : reportTab.id)}
                      >
                        <span className={`truncate text-left text-xs uppercase ${selected ? "font-bold tracking-[-.01em] text-gray-900" : "font-semibold text-gray-500 group-hover/tab:text-gray-800"}`}>
                          {t(label || "")}
                        </span>
                        <svg className={`-mr-1 ml-0.5 size-4 ${selected ? "text-gray-900" : "text-gray-500 group-hover/tab:text-gray-800"}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    {open === reportTab.id ? (
                      <div className="absolute top-full left-0 z-20 mt-2 min-w-56 origin-top-left rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
                        {reportTab.dropdown.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            data-selected={d.selected || d.id === active}
                            className="flex w-full items-center justify-between rounded-md px-4 py-2.5 text-left text-sm hover:bg-gray-100 data-[selected=true]:bg-gray-100"
                            onClick={() => {
                              if (d.onSelect) d.onSelect()
                              else onChange?.(d.id)
                              setOpen(null)
                            }}
                          >
                            {t(d.label)}
                            {d.selected || d.id === active ? <span className="text-indigo-600">✓</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              }
              return (
                <div key={reportTab.id} className={`-mb-px pb-4 ${selected ? "border-b-2 border-gray-900" : ""}`}>
                  <button
                    type="button"
                    className="group/tab relative rounded-sm"
                    onClick={() => onChange?.(reportTab.id)}
                  >
                    <span className={`truncate text-left text-xs uppercase ${selected ? "font-bold tracking-[-.01em] text-gray-900" : "font-semibold text-gray-500 group-hover/tab:text-gray-800"}`}>
                      {t(reportTab.label)}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="flex items-start gap-x-3">
          {showMore ? (
            <button
              type="button"
              className="relative mt-px flex rounded text-gray-500 transition-colors duration-150 hover:text-gray-600 before:absolute before:inset-[-8px] before:content-['']"
              title={t("查看详情")}
              aria-label={t("查看详情")}
              onClick={() => { if (details) setDetailsOpen(true) }}
            >
              <MoreLinkIcon />
            </button>
          ) : null}
          {extra}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {detailsOpen && details ? <DetailsModal spec={details} onClose={() => setDetailsOpen(false)} /> : null}
    </Surface>
  )
}

export function ReportMenu({
  title = "按此拆分",
  options,
  value,
  onChange,
}: {
  title?: string
  options: Array<{ id: string, label: string }>
  value: string
  onChange: (id: string) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-report-menu]")) setOpen(false)
    }
    window.addEventListener("mousedown", onDoc)
    return () => window.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div className="relative" data-report-menu>
      <button
        type="button"
        className="relative flex rounded text-gray-500 transition-colors duration-150 hover:text-gray-600"
        aria-label={t("拆分选项")}
        onClick={() => setOpen(!open)}
      >
        <svg className="size-[1.125rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
        </svg>
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 mt-2 min-w-48 origin-top-right rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
          <p className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t(title || "")}</p>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              data-selected={o.id === value}
              className="flex w-full items-center justify-between rounded-md px-4 py-2.5 text-left text-sm hover:bg-gray-100 data-[selected=true]:bg-gray-100"
              onClick={() => { onChange(o.id); setOpen(false) }}
            >
              {t(o.label)}
              {o.id === value ? <span className="text-indigo-600">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function Tile({
  icon = "settings",
  brand,
  id,
  title,
  subtitle,
  children,
}: {
  icon?: string
  brand?: BrandName
  id?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const { t } = useT()
  return (
    <Surface id={id} className="settings-card scroll-mt-24 bg-white shadow-sm">
      <header className="settings-card-heading">
        <span className="settings-card-icon">{brand ? <BrandIcon name={brand}/> : <UIIcon name={icon}/>}</span>
        <div className="settings-heading-copy min-w-0"><h2 className="text-lg leading-7 font-medium text-gray-900">{t(title || "")}</h2>
        {subtitle ? <div className="mt-px text-sm leading-5 text-gray-500">{t(subtitle || "")}</div> : null}</div>
      </header>
      <div className="mx-6 border-b border-gray-200" />
      <div className="relative p-4 sm:p-6">{children}</div>
    </Surface>
  )
}
