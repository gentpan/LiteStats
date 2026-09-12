import { useMemo, useState } from "react"
import { CountryFlag } from "~/components/icons"
import { ReportCard } from "~/components/ui"
import { countryName } from "~/lib/countries"
import type { RecentEvent } from "~/lib/ch"

function formatTime(iso: string) {
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z")
  if (Number.isNaN(date.getTime())) {
    const part = iso.slice(11, 19)
    return part || ""
  }
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })
}

function sessionCopy(row: RecentEvent) {
  const parts: string[] = []
  const country = countryName(row.country)
  if (row.country && country !== "未知") parts.push(`来自 ${country}`)
  if (row.os && row.device) parts.push(`使用 ${row.os} ${row.device.toLowerCase()}`)
  else if (row.os) parts.push(`使用 ${row.os}`)
  else if (row.device) parts.push(`使用 ${row.device.toLowerCase()}`)
  if (row.browser) parts.push(`浏览器 ${row.browser}`)
  if (parts.length === 0) return "一位访客开始了会话"
  return `访客 ${parts.join(" ")}`
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  )
}

function Avatar({ row }: { row: RecentEvent }) {
  const seed = `${row.country || ""}${row.browser || ""}${row.os || ""}`
  const hue = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360
  return (
    <span
      className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
      style={{ backgroundColor: `hsl(${hue} 55% 86%)` }}
    >
      {row.country ? <CountryFlag code={row.country} className="country-flag--avatar" /> : "•"}
    </span>
  )
}

function ActivityItem({ row }: { row: RecentEvent }) {
  if (row.name === "session") {
    return (
      <li className="flex items-start gap-3 py-2.5">
        <span className="w-20 shrink-0 pt-1.5 text-xs text-gray-500 tabular-nums">{formatTime(row.time)}</span>
        <Avatar row={row} />
        <p className="min-w-0 pt-1 text-sm text-gray-800">{sessionCopy(row)}</p>
      </li>
    )
  }
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="w-20 shrink-0 pt-0.5 text-xs text-gray-500 tabular-nums">{formatTime(row.time)}</span>
      <span className="flex size-8 shrink-0 items-center justify-center">
        <EyeIcon />
      </span>
      <div className="min-w-0 pt-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {row.name === "pageview" ? (row.pathname || "/") : row.name}
        </p>
        {row.name !== "pageview" && row.pathname ? (
          <p className="truncate text-xs text-gray-500">{row.pathname}</p>
        ) : null}
      </div>
    </li>
  )
}

export function ActivityLog({ rows }: { rows: RecentEvent[] }) {
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.pathname, row.name, countryName(row.country), row.browser, row.os, row.device, row.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
  }, [rows, query])

  return (
    <ReportCard className="col-span-full min-h-[24rem] md:h-auto" title="活动日志" more={false}>
      <div className="mt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索"
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">最近 30 分钟没有访问。</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {filtered.map((row, i) => (
            <ActivityItem key={`${row.time}-${row.pathname}-${i}`} row={row} />
          ))}
        </ul>
      )}
    </ReportCard>
  )
}
