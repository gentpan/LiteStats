import { useEffect, useRef, useState } from "react"
import { SiteSwitcher } from "~/components/SiteSwitcher"
import { INTERVAL_LABEL, PERIOD_LABEL, availableIntervals, intervalStorageKey, periodLabel, type DashSearch, type Interval, type Period } from "~/lib/range"

const GROUPS: Period[][] = [
  ["today", "yesterday", "realtime"],
  ["24h", "7d", "28d", "91d"],
  ["month", "last_month"],
  ["year", "12mo"],
  ["all", "custom"],
]

const HINT: Partial<Record<Period, string>> = {
  today: "D",
  yesterday: "E",
  realtime: "R",
  "24h": "H",
  "7d": "W",
  "28d": "F",
  "91d": "N",
  month: "M",
  last_month: "P",
  year: "Y",
  "12mo": "L",
  all: "A",
  custom: "C",
}

const FILTERS: Array<{ key: keyof DashSearch, label: string }> = [
  { key: "page", label: "页面" },
  { key: "source", label: "来源" },
  { key: "country", label: "国家/地区" },
  { key: "device", label: "设备" },
  { key: "browser", label: "浏览器" },
  { key: "os", label: "操作系统" },
]

export function DashTopBar({
  domain,
  live,
  search,
  onPeriod,
  readonly,
  onExport,
}: {
  domain: string
  live: number
  search: DashSearch
  onPeriod: (next: Partial<DashSearch>) => void
  readonly?: boolean
  onExport?: () => void
}) {
  const [open, setOpen] = useState<"filter" | "period" | "more" | null>(null)
  const [custom, setCustom] = useState(false)
  const [filterKey, setFilterKey] = useState<keyof DashSearch>("source")
  const [filterValue, setFilterValue] = useState("")
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(null)
        setCustom(false)
      }
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === "i" && search.period !== "realtime") {
        const options = availableIntervals(search.period, { from: search.from, to: search.to })
        if (options.length > 1) {
          e.preventDefault()
          const idx = options.indexOf(search.interval)
          const next = options[(idx >= 0 ? idx + 1 : 1) % options.length]
          localStorage.setItem(intervalStorageKey(domain, search.period), next)
          onPeriod({ interval: next })
        }
        return
      }
      const hit = (Object.entries(HINT) as Array<[Period, string]>).find(([, k]) => k === e.key.toUpperCase())
      if (!hit) return
      e.preventDefault()
      if (hit[0] === "custom") {
        setOpen("period")
        setCustom(true)
        return
      }
      onPeriod({ period: hit[0] })
      setOpen(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onPeriod, search.period, search.interval, search.from, search.to, domain])

  const label = periodLabel(search.period, { from: search.from, to: search.to })

  return (
    <div className="col-span-full flex w-full min-w-0 flex-nowrap items-center gap-x-1 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:gap-x-2.5 md:overflow-visible">
      <div className="flex shrink-0 items-center gap-x-1 md:gap-x-2.5">
        <SiteSwitcher domain={domain} readonly={readonly} />
        {search.period === "realtime" ? null : (
          <button
            type="button"
            className="flex h-8 items-center gap-x-1.5 rounded-md px-2 text-sm font-medium text-gray-700 hover:bg-gray-150/80"
            onClick={() => onPeriod({ period: "realtime" })}
          >
            <svg className="inline-block w-2 fill-current text-green-500" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" /></svg>
            <span className="text-gray-500">{live}<span className="hidden lg:inline"> 当前访客</span></span>
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-x-1 md:gap-x-2.5" ref={box}>
        <div className="relative">
          <button
            type="button"
            className={`flex h-8 items-center gap-x-1.5 rounded-md px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-150/80 ${open === "filter" ? "bg-gray-150/80" : ""}`}
            onClick={() => setOpen(open === "filter" ? null : "filter")}
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
            </svg>
            <span>筛选</span>
          </button>
          {open === "filter" ? (
            <div className="absolute right-0 z-20 mt-2 w-72 origin-top-right rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
              <div className="grid grid-cols-2 gap-0.5 p-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    data-selected={filterKey === f.key}
                    className="rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 data-[selected=true]:bg-gray-100"
                    onClick={() => setFilterKey(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 p-2">
                <input
                  className="input"
                  placeholder="输入筛选值"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !filterValue.trim()) return
                    onPeriod({ [filterKey]: filterValue.trim() } as Partial<DashSearch>)
                    setFilterValue("")
                    setOpen(null)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (!filterValue.trim()) return
                    onPeriod({ [filterKey]: filterValue.trim() } as Partial<DashSearch>)
                    setFilterValue("")
                    setOpen(null)
                  }}
                >
                  应用
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            className={`flex h-8 items-center gap-x-1.5 rounded-md px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-150/80 ${open === "period" ? "bg-gray-150/80" : ""}`}
            onClick={() => { setOpen(open === "period" ? null : "period"); setCustom(false) }}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 7.5h16.5M4.5 6.75h15A1.5 1.5 0 0 1 21 8.25v11.25A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5V8.25A1.5 1.5 0 0 1 4.5 6.75Z" />
            </svg>
            <span className="truncate">{label}</span>
          </button>
          {open === "period" ? (
            <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
              {custom ? (
                <div className="space-y-2 p-2">
                  <input className="input" type="date" value={search.from.startsWith("20") ? search.from : ""} onChange={(e) => onPeriod({ period: "custom", from: e.target.value, to: search.to.startsWith("20") ? search.to : e.target.value })} />
                  <input className="input" type="date" value={search.to.startsWith("20") ? search.to : ""} onChange={(e) => onPeriod({ period: "custom", from: search.from.startsWith("20") ? search.from : e.target.value, to: e.target.value })} />
                </div>
              ) : GROUPS.map((group, i) => (
                <div key={i}>
                  {i > 0 ? <div className="my-1 h-px bg-gray-200" /> : null}
                  {group.map((id) => (
                    <button
                      key={id}
                      type="button"
                      data-selected={search.period === id}
                      className="flex w-full items-center justify-between rounded-md px-4 py-2.5 text-left text-sm leading-tight hover:bg-gray-100 hover:text-gray-900 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900"
                      onClick={() => {
                        if (id === "custom") { setCustom(true); return }
                        onPeriod({ period: id })
                        setOpen(null)
                      }}
                    >
                      {PERIOD_LABEL[id]}
                      {HINT[id] ? <kbd className="text-xs font-normal text-gray-400">{HINT[id]}</kbd> : null}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {search.period === "realtime" ? null : (
          <div className="relative">
            <button
              type="button"
              className={`flex size-8 items-center justify-center rounded-md text-gray-700 hover:bg-gray-150/80 ${open === "more" ? "bg-gray-150/80" : ""}`}
              onClick={() => setOpen(open === "more" ? null : "more")}
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </button>
            {open === "more" ? (
              <div className="absolute right-0 z-20 mt-2 min-w-72 rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
                {(() => {
                  const options = availableIntervals(search.period, { from: search.from, to: search.to })
                  if (options.length <= 1) return null
                  return (
                    <div className="flex w-full items-center justify-between gap-x-2 py-1 pr-2 pl-4">
                      <span className="shrink-0 text-sm font-medium text-gray-700">图表间隔</span>
                      <div className="flex rounded-md bg-gray-100 p-0.5">
                        {options.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className={`rounded px-2 py-1 text-xs font-medium ${search.interval === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                            onClick={() => {
                              localStorage.setItem(intervalStorageKey(domain, search.period), id)
                              onPeriod({ interval: id })
                            }}
                          >
                            {INTERVAL_LABEL[id as Interval]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-4 py-2.5 text-sm leading-tight hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => {
                    onExport?.()
                    setOpen(null)
                  }}
                >
                  <span className="text-sm">导出统计</span>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 12 12 16.5m0 0 4.5-4.5M12 16.5V3" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
