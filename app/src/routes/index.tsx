import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { SslPill, StatusPill } from "~/components/SiteMonitorPanel"
import { Shell } from "~/components/Shell"
import { meFn, sitesFn } from "~/lib/actions"
import { numberShort } from "~/lib/format"
import { useT } from "~/lib/i18n"

export const Route = createFileRoute("/")({
  loader: async () => {
    const me = await meFn()
    if (!me) return { me: null, sites: [] }
    return { me, sites: await sitesFn() }
  },
  component: HomePage,
})

function HomePage() {
  const { me, sites } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useT()
  const [q, setQ] = useState("")
  const [menu, setMenu] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return sites
    return sites.filter((site) => site.domain.toLowerCase().includes(s))
  }, [q, sites])

  if (!me) {
    void router.navigate({ to: "/login" })
    return null
  }

  return (
    <Shell user={me}>
      <div className="pt-6">
        <div className="flex items-center gap-2 border-b border-gray-200 py-4">
          <h2 className="min-w-0 truncate text-xl font-semibold text-gray-900 sm:text-2xl">我的个人站点</h2>
        </div>

        <div className="relative z-10 flex flex-col justify-between gap-y-2 pt-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-80">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-800">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
            </div>
            <input
              ref={searchRef}
              className="block w-full rounded-md border border-gray-300 py-2.5 pr-3.5 pl-8 text-sm focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20 focus:outline-none"
              placeholder={searching ? "搜索站点" : "按 / 搜索"}
              value={q}
              onFocus={() => setSearching(true)}
              onBlur={() => setSearching(false)}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Link to="/sites/new" className="btn btn-primary">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            添加网站
          </Link>
        </div>

        {q && filtered.length === 0 ? (
          <p className="mt-4 text-center text-gray-900">没有找到站点，换个关键词试试。</p>
        ) : null}

        {sites.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center py-12">
            <h3 className="text-center text-base font-medium text-gray-900">添加第一个个人站点</h3>
            <p className="mt-1 text-center text-sm text-pretty text-gray-500">用简洁、保护隐私的统计，更好地了解你的受众。</p>
            <Link to="/sites/new" className="btn btn-primary mt-6">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              添加网站
            </Link>
          </div>
        ) : (
          <ul className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((site) => (
              <li key={site.id} className="group relative">
                <Link to="/sites/$domain" params={{ domain: site.domain }} className="block">
                  <div className="col-span-1 flex cursor-pointer flex-col gap-y-5 rounded-md bg-white p-5 shadow-sm transition duration-100 group-hover:shadow-lg">
                    <div className="flex w-full items-center justify-between gap-x-2.5">
                      <img alt="" className="size-[18px] shrink-0" src={`/favicon/sources/${encodeURIComponent(site.domain)}`} />
                      <div className="w-full flex-1">
                        <h3 className="truncate text-md leading-[22px] font-medium text-gray-900 sm:text-lg" style={{ width: "calc(100% - 4rem)" }}>{site.domain}</h3>
                      </div>
                    </div>
                    <div className="flex flex-col gap-y-5 truncate text-sm text-gray-600">
                      <span className="h-12 max-w-sm text-indigo-500 sm:max-w-none">
                        <Sparkline values={site.sparkline || []} />
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          up={site.monitor?.status === "up"}
                          empty={!site.monitor?.status}
                          label={site.monitor?.status === "up" ? t("monitor.up") : site.monitor?.status === "down" ? t("monitor.down") : t("monitor.pending")}
                        />
                        <SslPill health={site.monitor?.ssl_health || "none"} days={site.monitor?.ssl_days_left} />
                      </div>
                      <div className="flex items-end justify-between">
                        <div className="flex flex-col">
                          <p className="text-lg font-bold text-gray-900 sm:text-xl">{numberShort(site.visitors || 0)}</p>
                          <p className="text-gray-600">{site.visitors === 1 ? "位访客（近 24 小时）" : "位访客（近 24 小时）"}</p>
                        </div>
                        <p className="text-sm text-gray-900">
                          {site.change > 0 ? (
                            <svg className="mr-0.5 inline-block h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M8.25 3.75H19.5v11.25a.75.75 0 0 1-1.5 0V6.31L5.03 19.28a.75.75 0 0 1-1.06-1.06L16.69 5.25H8.25a.75.75 0 0 1 0-1.5Z" clipRule="evenodd" /></svg>
                          ) : site.change < 0 ? (
                            <svg className="mr-0.5 inline-block h-3 w-3 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M8.25 20.25H19.5V9a.75.75 0 0 0-1.5 0v8.69L5.03 4.72a.75.75 0 0 0-1.06 1.06L16.69 18.75H8.25a.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
                          ) : null}
                          {Math.abs(site.change || 0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="absolute top-3.5 right-1">
                  <button
                    type="button"
                    className="btn-ghost rounded-md px-2.5 py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    onClick={(e) => { e.preventDefault(); setMenu(menu === site.domain ? null : site.domain) }}
                  >
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                    </svg>
                  </button>
                  {menu === site.domain ? (
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
                      <Link to="/sites/$domain/settings" params={{ domain: site.domain }} search={{ tab: "general" }} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-sm hover:bg-gray-100" onClick={() => setMenu(null)}>
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        设置
                      </Link>
                      <Link to="/sites/$domain/settings" params={{ domain: site.domain }} search={{ tab: "monitor" }} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-sm hover:bg-gray-100" onClick={() => setMenu(null)}>
                        {t("monitor.title")}
                      </Link>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const pts = values.length ? values : [0, 0]
  const max = Math.max(1, ...pts)
  const w = 240
  const h = 48
  const step = pts.length > 1 ? w / (pts.length - 1) : w
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ")
  const area = `${d} L${(pts.length - 1) * step},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full">
      <path d={area} fill="currentColor" opacity="0.12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
