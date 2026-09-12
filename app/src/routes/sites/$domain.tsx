import { Outlet, createFileRoute, useChildMatches, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ActivityLog } from "~/components/ActivityLog"
import { DashTopBar } from "~/components/DashTopBar"
import { Shell } from "~/components/Shell"
import { VisitorGraph } from "~/components/VisitorGraph"
import { MapCard } from "~/components/WorldMap"
import { List, ReportCard, ReportMenu } from "~/components/ui"
import { percentShort } from "~/lib/format"
import {
  dashboardFn,
  exploreFn,
  meFn,
} from "~/lib/actions"
import { countryName } from "~/lib/countries"
import { languageName } from "~/lib/languages"
import type { MetricKey } from "~/lib/ch"
import { downloadDashboardZip } from "~/lib/export"
import { dashInput, isoDate, parseDashSearch, parseDate } from "~/lib/range"

export const Route = createFileRoute("/sites/$domain")({
  validateSearch: parseDashSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, location }) => {
    const me = await meFn()
    if (location.pathname.includes("/settings")) return { me, data: null }
    try {
      const data = await dashboardFn({ data: dashInput(params.domain, deps) })
      return { me, data }
    } catch {
      return { me, data: null }
    }
  },
  component: SitePage,
  errorComponent: ({ error }) => (
    <Shell>
      <p className="text-red-500">{error instanceof Error ? error.message : "页面出错"}</p>
    </Shell>
  ),
})

function SitePage() {
  const childMatches = useChildMatches()
  if (childMatches.length > 0) return <Outlet />
  return <Dashboard />
}

function Dashboard() {
  const { me, data } = Route.useLoaderData()
  const { domain } = Route.useParams()
  const search = Route.useSearch()
  const router = useRouter()
  const [metric, setMetric] = useState<MetricKey>("visitors")
  const [sourceTab, setSourceTab] = useState("source")
  const [pageTab, setPageTab] = useState("pages")
  const [pageMode, setPageMode] = useState("path")
  const [locationTab, setLocationTab] = useState("countries")
  const [deviceTab, setDeviceTab] = useState("browser")
  const [behaviourTab, setBehaviourTab] = useState(
    ["goals", "props", "funnels", "explore"].includes(search.tab) ? search.tab : "goals",
  )
  const [journey, setJourney] = useState<Array<{ name: string, pathname: string }>>([])
  const [exploreRows, setExploreRows] = useState(data?.explore || [])
  const [explorePath, setExplorePath] = useState<Array<{ name: string, pathname: string, visitors: number, conversion_rate: number }>>([])

  useEffect(() => {
    setExploreRows(data?.explore || [])
    setJourney([])
    setExplorePath([])
  }, [data?.explore, search.from, search.to, search.source, search.page, search.country])

  useEffect(() => {
    const id = window.setInterval(() => { void router.invalidate() }, search.period === "realtime" ? 8000 : 20000)
    return () => window.clearInterval(id)
  }, [router, search.period])

  if (!me && !data?.site.public) {
    void router.navigate({ to: "/login" })
    return null
  }
  if (!data) return <Shell user={me}><p>无法读取站点</p></Shell>

  const readonly = !me
  const chips = [
    search.source && { key: "source" as const, label: `来源 ${search.source}` },
    search.page && { key: "page" as const, label: `页面 ${search.page}` },
    search.country && { key: "country" as const, label: `地区 ${countryName(search.country)}` },
    search.browser && { key: "browser" as const, label: `浏览器 ${search.browser}` },
    search.os && { key: "os" as const, label: `系统 ${search.os}` },
    search.device && { key: "device" as const, label: `设备 ${search.device}` },
    search.goal && { key: "goal" as const, label: `目标 ${data.goals.find((g) => g.id === search.goal)?.display_name || search.goal}` },
  ].filter(Boolean) as Array<{ key: "source" | "page" | "country" | "browser" | "os" | "device" | "goal", label: string }>

  function go(next: Partial<typeof search>) {
    void router.navigate({ to: "/sites/$domain", params: { domain }, search: parseDashSearch({ ...search, ...next }) })
  }

  const countries = data.countries.map((r) => ({ ...r, label: countryName(r.name) }))

  return (
    <Shell user={me}>
      <div className="mb-16 grid grid-cols-1 gap-5 md:grid-cols-2">
        <DashTopBar
          domain={domain}
          live={data.overview.live}
          search={search}
          onPeriod={go}
          readonly={readonly}
          onExport={() => downloadDashboardZip({
            domain,
            from: search.from,
            to: search.to,
            seriesBy: data.seriesBy,
            series: data.series,
            sources: data.sources,
            pages: data.pages,
            entryPages: data.entryPages,
            exitPages: data.exitPages,
            browsers: data.browsers,
            os: data.os,
            devices: data.devices,
            countries: data.countries,
            regions: data.regions,
            cities: data.cities,
            channels: data.channels,
            utm: data.utm,
            utmMediums: data.utmMediums,
            campaigns: data.campaigns,
            goals: data.goals,
            overview: data.overview,
          })}
        />

        {chips.length ? (
          <div className="col-span-full flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.key} type="button" className="flex h-8 items-center rounded-md bg-white px-2.5 text-sm text-gray-700 shadow-sm hover:text-indigo-700" onClick={() => go({ [c.key]: c.key === "goal" ? 0 : "" })}>
                {c.label}
                <span className="ml-1.5 text-gray-400">×</span>
              </button>
            ))}
            <button type="button" className="text-sm text-gray-500 hover:text-gray-900" onClick={() => go({ source: "", page: "", country: "", browser: "", os: "", device: "", goal: 0 })}>清除筛选</button>
          </div>
        ) : null}

        <>
            <VisitorGraph
              overview={data.overview}
              compare={data.compare}
              series={data.series}
              seriesBy={data.seriesBy}
              metric={metric}
              onMetric={setMetric}
              interval={search.interval}
              realtime={search.period === "realtime"}
              onZoom={(date) => {
                const day = date.slice(0, 10)
                if (search.interval === "month") {
                  const start = parseDate(day)
                  const from = isoDate(new Date(start.getFullYear(), start.getMonth(), 1))
                  const to = isoDate(new Date(start.getFullYear(), start.getMonth() + 1, 0))
                  go({ period: "custom", from, to })
                  return
                }
                go({ period: "custom", from: day, to: day })
              }}
            />

            <MapCard
              rows={countries}
              live={data.liveGeo || []}
              liveCount={data.overview.live}
              heatmap={data.heatmap || []}
              onCountryClick={(code) => {
                setLocationTab("regions")
                go({ country: code })
              }}
            />

            <ReportCard
              tabs={[
                { id: "channel", label: "渠道" },
                { id: "source", label: "来源" },
                {
                  id: "campaigns",
                  label: "活动",
                  dropdown: [
                    { id: "utm_medium", label: "UTM 媒介" },
                    { id: "utm_source", label: "UTM 来源" },
                    { id: "utm_campaign", label: "UTM 活动" },
                  ],
                },
                {
                  id: "organic_kw",
                  label: sourceTab === "google_kw" ? "Google 搜索词" : sourceTab === "bing_kw" ? "Bing 搜索词" : "搜索词",
                  dropdown: [
                    { id: "organic_kw", label: "引荐搜索词" },
                    { id: "google_kw", label: "Google 搜索词" },
                    { id: "bing_kw", label: "Bing 搜索词" },
                  ],
                },
              ]}
              active={sourceTab}
              onChange={setSourceTab}
              details={{
                title: sourceTab === "channel" ? "渠道" : sourceTab === "utm_medium" ? "UTM 媒介" : sourceTab === "utm_source" ? "UTM 来源" : sourceTab === "utm_campaign" ? "UTM 活动" : sourceTab === "google_kw" ? "Google 搜索词" : sourceTab === "bing_kw" ? "Bing 搜索词" : sourceTab === "organic_kw" ? "引荐搜索词" : "来源",
                kind: sourceTab === "source" ? "source" : sourceTab === "channel" ? "channel" : sourceTab.endsWith("_kw") ? "keyword" : "campaign",
                rows: sourceRows(data, sourceTab),
                onPick: sourceTab === "source" ? (name) => go({ source: name }) : undefined,
              }}
            >
              {keywordEmpty(data, sourceTab, domain) || (
                <List
                  plain
                  kind={sourceTab === "source" ? "source" : sourceTab === "channel" ? "channel" : sourceTab.endsWith("_kw") ? "keyword" : "campaign"}
                  rows={sourceRows(data, sourceTab)}
                  onPick={sourceTab === "source" ? (name) => go({ source: name }) : undefined}
                />
              )}
            </ReportCard>

            <ReportCard
              tabs={[{ id: "pages", label: "热门页面" }, { id: "entry", label: "进入页" }, { id: "exit", label: "退出页" }, { id: "title", label: "标题" }, { id: "query", label: "查询" }]}
              active={pageTab}
              onChange={setPageTab}
              extra={<ReportMenu value={pageMode} onChange={setPageMode} options={[{ id: "path", label: "路径" }, { id: "hostname", label: "网址" }]} />}
              details={{
                title: pageMode === "hostname" ? "主机名" : pageTab === "entry" ? "进入页" : pageTab === "exit" ? "退出页" : pageTab === "title" ? "标题" : pageTab === "query" ? "查询" : "热门页面",
                kind: pageMode === "hostname" ? "hostname" : pageTab === "title" ? "title" : pageTab === "query" ? "query" : "page",
                rows: pageRows(data, pageTab, pageMode, domain),
                onPick: pageMode === "path" && pageTab === "pages" ? (name) => go({ page: name }) : undefined,
              }}
            >
              <List
                plain
                kind={pageMode === "hostname" ? "hostname" : pageTab === "title" ? "title" : pageTab === "query" ? "query" : "page"}
                rows={pageRows(data, pageTab, pageMode, domain)}
                onPick={pageMode === "path" && pageTab === "pages" ? (name) => go({ page: name }) : undefined}
              />
            </ReportCard>

            <ReportCard
              tabs={[{ id: "countries", label: "国家/地区" }, { id: "regions", label: "地区" }, { id: "cities", label: "城市" }]}
              active={locationTab}
              onChange={setLocationTab}
              details={{
                title: locationTab === "regions" ? "地区" : locationTab === "cities" ? "城市" : "国家/地区",
                kind: locationTab === "regions" ? "region" : locationTab === "cities" ? "city" : "country",
                rows: locationRows(data, locationTab, countries),
                onPick: locationTab === "regions" || locationTab === "cities" ? undefined : (name) => go({ country: name }),
              }}
            >
              <List
                plain
                kind={locationTab === "regions" ? "region" : locationTab === "cities" ? "city" : "country"}
                rows={locationRows(data, locationTab, countries)}
                onPick={locationTab === "regions" || locationTab === "cities" ? undefined : (name) => go({ country: name })}
              />
            </ReportCard>

            <ReportCard
              tabs={[{ id: "browser", label: "浏览器" }, { id: "os", label: "操作系统" }, { id: "device", label: "设备" }, { id: "language", label: "语言" }, { id: "screen", label: "屏幕" }]}
              active={deviceTab}
              onChange={setDeviceTab}
              details={{
                title: deviceTab === "os" ? "操作系统" : deviceTab === "device" ? "设备" : deviceTab === "language" ? "语言" : deviceTab === "screen" ? "屏幕" : "浏览器",
                kind: deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser",
                rows: deviceRows(data, deviceTab),
                onPick: deviceTab === "language" || deviceTab === "screen" ? undefined : (name) => go({ [deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : "browser"]: name }),
              }}
            >
              <List
                plain
                kind={deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser"}
                rows={deviceRows(data, deviceTab)}
                onPick={deviceTab === "language" || deviceTab === "screen" ? undefined : (name) => go({ [deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : "browser"]: name })}
              />
            </ReportCard>

            <ReportCard
              className="col-span-full"
              tabs={[
                { id: "goals", label: "目标" },
                {
                  id: "props",
                  label: "属性",
                  dropdown: data.propKeys.length
                    ? data.propKeys.map((k) => ({
                        id: k,
                        label: k,
                        selected: data.propKey === k,
                        onSelect: () => { setBehaviourTab("props"); go({ prop: k }) },
                      }))
                    : undefined,
                },
                {
                  id: "funnels",
                  label: "漏斗",
                  dropdown: data.funnels.length
                    ? data.funnels.map((f) => ({
                        id: String(f.id),
                        label: f.name,
                        selected: data.funnelId === f.id,
                        onSelect: () => { setBehaviourTab("funnels"); go({ funnel: f.id }) },
                      }))
                    : undefined,
                },
                { id: "explore", label: "探索" },
              ]}
              active={behaviourTab}
              onChange={setBehaviourTab}
              details={behaviourTab === "goals" ? {
                title: "目标转化",
                kind: "goal",
                columns: [
                  { key: "visitors", label: "访客" },
                  { key: "events", label: "转化" },
                  { key: "cr", label: "转化率", format: (n) => percentShort(n) },
                ],
                rows: data.goals.map((g) => ({
                  name: g.display_name,
                  value: g.visitors,
                  metrics: {
                    visitors: g.visitors,
                    events: g.events ?? g.visitors,
                    cr: data.overview.visitors ? (g.visitors / data.overview.visitors) * 100 : 0,
                  },
                })),
                onPick: (name) => {
                  const g = data.goals.find((x) => x.display_name === name)
                  if (g) go({ goal: g.id })
                },
              } : behaviourTab === "props" ? {
                title: "自定义属性",
                rows: data.props,
              } : undefined}
            >
              {behaviourTab === "goals" ? (
                <List
                  plain
                  kind="goal"
                  columns={[
                    { key: "visitors", label: "访客" },
                    { key: "events", label: "转化" },
                    { key: "cr", label: "转化率", format: (n) => percentShort(n) },
                  ]}
                  rows={data.goals.map((g) => ({
                    name: g.display_name,
                    value: g.visitors,
                    metrics: {
                      visitors: g.visitors,
                      events: g.events ?? g.visitors,
                      cr: data.overview.visitors ? (g.visitors / data.overview.visitors) * 100 : 0,
                    },
                  }))}
                  onPick={(name) => {
                    const g = data.goals.find((x) => x.display_name === name)
                    if (g) go({ goal: g.id })
                  }}
                />
              ) : null}
              {behaviourTab === "props" ? (
                data.propKeys.length === 0
                  ? <div className="flex h-full items-center justify-center font-medium text-gray-500" style={{ minHeight: 220 }}>这段时间还没有自定义属性。</div>
                  : <List plain rows={data.props} />
              ) : null}
              {behaviourTab === "funnels" ? (
                data.funnel ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-gray-500">进入漏斗 {data.funnel.entering_visitors} / 全部访客 {data.funnel.all_visitors}</p>
                    {data.funnel.steps.map((s, i) => (
                      <div key={`${s.label}-${i}`}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{i + 1}. {s.label}</span>
                          <span className="font-medium">{s.visitors} · {s.conversion_rate}%</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-sm bg-gray-100">
                          <div className="h-full bg-indigo-500" style={{ width: `${Math.max(4, s.conversion_rate)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="flex h-full items-center justify-center font-medium text-gray-500" style={{ minHeight: 220 }}>还没有漏斗。</div>
              ) : null}
              {behaviourTab === "explore" ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-gray-500">{journey.length === 0 ? "从最常见的页面/事件开始" : ""}</span>
                    <button className="text-sm text-indigo-600 hover:text-indigo-500" type="button" onClick={() => { setJourney([]); setExploreRows(data.explore); setExplorePath([]) }}>重新开始</button>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2 text-sm">
                    {journey.map((s, i) => (
                      <span key={`${s.name}-${s.pathname}-${i}`} className="flex h-8 items-center rounded-md bg-white px-2.5 text-gray-700 shadow-sm">
                        {s.name === "pageview" ? s.pathname : s.name}
                        {explorePath[i] ? ` · ${explorePath[i].visitors} · ${explorePath[i].conversion_rate}%` : ""}
                      </span>
                    ))}
                  </div>
                  <ul>
                    {exploreRows.map((r) => (
                      <li key={`${r.name}-${r.pathname}`} className="mt-1">
                        <button
                          type="button"
                          className="group/row relative flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-gray-100/60"
                          onClick={async () => {
                            const nextJourney = [...journey, r]
                            setJourney(nextJourney)
                            const fresh = await exploreFn({ data: { ...dashInput(domain, search), journey: nextJourney } })
                            setExploreRows(fresh.next)
                            setExplorePath(fresh.path)
                          }}
                        >
                          <span>{r.name === "pageview" ? r.pathname : `${r.name} ${r.pathname}`}</span>
                          <span className="font-medium tabular-nums">{r.visitors}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </ReportCard>

            <ActivityLog rows={data.recent} />
        </>

      </div>
    </Shell>
  )
}

type Dash = NonNullable<Awaited<ReturnType<typeof dashboardFn>>>

function sourceRows(data: Dash, tab: string) {
  if (tab === "channel") return data.channels
  if (tab === "utm_medium") return data.utmMediums
  if (tab === "utm_source") return data.utm
  if (tab === "utm_campaign") return data.campaigns
  if (tab === "google_kw") return data.searchTerms?.google.rows || []
  if (tab === "bing_kw") return data.searchTerms?.bing.rows || []
  if (tab === "organic_kw") return data.searchTerms?.organic || data.keywords || []
  return data.sources
}

function keywordEmpty(data: Dash, tab: string, domain: string) {
  if (tab === "google_kw" && !data.searchTerms?.google.configured && !(data.searchTerms?.google.rows || []).length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
        <p>还没连接 Google Search Console，所以看不到谷歌搜索词。</p>
        <a href={`/sites/${encodeURIComponent(domain)}/settings?tab=integrations`} className="mt-3 text-indigo-600 hover:text-indigo-500">去集成里连接</a>
      </div>
    )
  }
  if (tab === "bing_kw" && !data.searchTerms?.bing.configured && !(data.searchTerms?.bing.rows || []).length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
        <p>还没连接 Bing Webmaster，所以看不到必应搜索词。</p>
        <a href={`/sites/${encodeURIComponent(domain)}/settings?tab=integrations`} className="mt-3 text-indigo-600 hover:text-indigo-500">去集成里连接</a>
      </div>
    )
  }
  return null
}

function pageRows(data: Dash, tab: string, mode: string, domain: string) {
  if (mode === "hostname") return data.hostnames
  if (tab === "title") return data.titles || []
  if (tab === "query") return data.queries || []
  const rows = tab === "entry" ? data.entryPages : tab === "exit" ? data.exitPages : data.pages
  return rows.map((r) => ({
    ...r,
    href: r.name.startsWith("http") ? r.name : `https://${domain}${r.name.startsWith("/") ? "" : "/"}${r.name}`,
  }))
}

function locationRows(data: Dash, tab: string, countries: Array<{ name: string, value: number, label: string }>) {
  if (tab === "regions") return data.regions
  if (tab === "cities") return data.cities
  return countries
}

function deviceRows(data: Dash, tab: string) {
  if (tab === "os") return data.os
  if (tab === "device") return data.devices
  if (tab === "language") return (data.languages || []).map((r) => ({ ...r, label: languageName(r.name) }))
  if (tab === "screen") return data.screens || []
  return data.browsers
}

