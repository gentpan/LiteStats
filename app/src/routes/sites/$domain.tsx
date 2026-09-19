import { Surface } from "~/components/Surface"
import { TrafficHeatmap } from "~/components/TrafficHeatmap"
import { PageState } from "~/components/PageState"
import { useT } from "~/lib/i18n"
import { Navigate, redirect } from "@tanstack/react-router"
import type { SearchSchemaInput } from "@tanstack/react-router"
import type { DashSearch } from "~/lib/range"
import { Outlet, createFileRoute, useChildMatches, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { DashTopBar } from "~/components/DashTopBar"
import { Shell } from "~/components/Shell"
import { VisitorGraph } from "~/components/VisitorGraph"
import { MapCard } from "~/components/WorldMap"
import { List, ReportCard, ReportMenu } from "~/components/ui"
import {
  dashboardFn,
  meFn,
} from "~/lib/actions"
import { countryName } from "~/lib/countries"
import { languageName } from "~/lib/languages"
import type { MetricKey } from "~/lib/ch"
import { downloadDashboardZip } from "~/lib/export"
import { compactDashSearch, dashInput, isoDate, parseDashSearch, parseDate } from "~/lib/range"

export const Route = createFileRoute("/sites/$domain")({
  validateSearch: (search: Partial<DashSearch> & SearchSchemaInput) => parseDashSearch(search),
  search: { middlewares: [({search,next}) => compactDashSearch(next(search))] },
  beforeLoad: ({params,location}) => {
    if (location.pathname.endsWith("/settings") || location.pathname.endsWith("/activity")) return
    const raw = location.search as Record<string, unknown>
    const clean = compactDashSearch(raw)
    if (Object.keys(raw).some(key => raw[key] !== clean[key])) {
      throw redirect({to:"/sites/$domain",params:{domain:params.domain},search:clean,replace:true})
    }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, location }) => {
    const me = await meFn()
    if ((location.pathname.endsWith("/settings") || location.pathname.endsWith("/activity"))) return { me, data: null }
    try {
      const data = await dashboardFn({ data: dashInput(params.domain, deps) })
      return { me, data }
    } catch (error) {
      throw error
    }
  },
  component: SitePage,
  errorComponent: ({ error }) => (
    <PageState title="页面出错" description={error instanceof Error ? error.message : undefined} />
  ),
})

function SitePage() {
  const childMatches = useChildMatches()
  if (childMatches.length > 0) return <Outlet />
  return <Dashboard />
}

function Dashboard() {
  const { t, locale } = useT()
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

  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void router.invalidate() }, search.period === "realtime" ? 8000 : 20000)
    return () => window.clearInterval(id)
  }, [router, search.period])

  if (!me && !data?.site.public) {
    return <Navigate to="/login" />
  }
  if (!data) return <Shell user={me}><p>{t("无法读取站点")}</p></Shell>

  const readonly = !me
  const chips = [
    search.source && { key: "source" as const, label: t("来源 {0}", {0: search.source}) },
    search.page && { key: "page" as const, label: t("页面 {0}", {0: search.page}) },
    search.country && { key: "country" as const, label: t("地区 {0}", {0: countryName(search.country, locale)}) },
    search.browser && { key: "browser" as const, label: t("浏览器 {0}", {0: search.browser}) },
    search.os && { key: "os" as const, label: t("系统 {0}", {0: search.os}) },
    search.device && { key: "device" as const, label: t("设备 {0}", {0: search.device}) },
  ].filter(Boolean) as Array<{ key: "source" | "page" | "country" | "browser" | "os" | "device", label: string }>

  function go(next: Partial<typeof search>) {
    void router.navigate({ to: "/sites/$domain", params: { domain }, search: parseDashSearch({ ...search, ...next }) })
  }

  const countries = data.countries.map((r) => ({ ...r, label: countryName(r.name, locale) }))

  return (
    <Shell user={me}>
      <div className="mb-16 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        <DashTopBar
          domain={domain}
          live={data.overview.live}
          filterOptions={{page:data.pages,source:data.sources,country:data.countries.map(row=>({...row,label:countryName(row.name,locale)})),device:data.devices,browser:data.browsers,os:data.os}}
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
            overview: data.overview,
          })}
        />

        {chips.length ? (
          <div className="col-span-full flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.key} type="button" className="flex h-8 items-center rounded-md bg-white px-2.5 text-sm text-gray-700 shadow-sm hover:text-indigo-700" onClick={() => go({ [c.key]: "" })}>
                {t(c.label)}
                <span className="ml-1.5 text-gray-400">×</span>
              </button>
            ))}
            <button type="button" className="text-sm text-gray-500 hover:text-gray-900" onClick={() => go({ source: "", page: "", country: "", browser: "", os: "", device: "" })}>{t("清除筛选")}</button>
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
              mapConfig={data.mapConfig}
              rows={countries}
              live={data.liveGeo || []}
              liveCount={data.overview.live}
              onCountryClick={(code) => {
                setLocationTab("regions")
                go({ country: code })
              }}
            />

            <ReportCard className="location-report col-span-full"
              tabs={[{ id: "countries", label: "国家/地区" }, { id: "regions", label: "地区" }, { id: "cities", label: "城市" }]}
              active={locationTab}
              onChange={setLocationTab}
              details={{
                title: locationTab === "regions" ? t("地区") : locationTab === "cities" ? t("城市") : t("国家/地区"),
                kind: locationTab === "regions" ? "region" : locationTab === "cities" ? "city" : "country",
                rows: locationRows(data, locationTab, countries),
                onPick: locationTab === "regions" || locationTab === "cities" ? undefined : (name) => go({ country: name }),
              }}
            >
              <List compact
                plain
                kind={locationTab === "regions" ? "region" : locationTab === "cities" ? "city" : "country"}
                rows={locationRows(data, locationTab, countries)}
                onPick={locationTab === "regions" || locationTab === "cities" ? undefined : (name) => go({ country: name })}
              />
            </ReportCard>

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
                  label: sourceTab === "google_kw" ? t("Google 搜索词") : sourceTab === "bing_kw" ? t("Bing 搜索词") : t("搜索词"),
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
                title: sourceTab === "channel" ? t("渠道") : sourceTab === "utm_medium" ? t("UTM 媒介") : sourceTab === "utm_source" ? t("UTM 来源") : sourceTab === "utm_campaign" ? t("UTM 活动") : sourceTab === "google_kw" ? t("Google 搜索词") : sourceTab === "bing_kw" ? t("Bing 搜索词") : sourceTab === "organic_kw" ? t("引荐搜索词") : t("来源"),
                kind: sourceTab === "source" ? "source" : sourceTab === "channel" ? "channel" : sourceTab.endsWith("_kw") ? "keyword" : "campaign",
                rows: sourceRows(data, sourceTab),
                onPick: sourceTab === "source" ? (name) => go({ source: name }) : undefined,
              }}
            >
              {keywordEmpty(data, sourceTab, domain, t) || (
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
                title: pageMode === "hostname" ? t("主机名") : pageTab === "entry" ? t("进入页") : pageTab === "exit" ? t("退出页") : pageTab === "title" ? t("标题") : pageTab === "query" ? t("查询") : t("热门页面"),
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

            <Surface className="analytics-panel traffic-report"><TrafficHeatmap cells={data.heatmap || []} /></Surface>

            <ReportCard
              tabs={[{ id: "browser", label: "浏览器" }, { id: "os", label: "操作系统" }, { id: "device", label: "设备" }, { id: "language", label: "语言" }, { id: "screen", label: "屏幕" }]}
              active={deviceTab}
              onChange={setDeviceTab}
              details={{
                title: deviceTab === "os" ? t("操作系统") : deviceTab === "device" ? t("设备") : deviceTab === "language" ? t("语言") : deviceTab === "screen" ? t("屏幕") : t("浏览器"),
                kind: deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser",
                rows: deviceRows(data, deviceTab, locale),
                onPick: deviceTab === "language" || deviceTab === "screen" ? undefined : (name) => go({ [deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : "browser"]: name }),
              }}
            >
              <List
                plain
                kind={deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser"}
                rows={deviceRows(data, deviceTab, locale)}
                onPick={deviceTab === "language" || deviceTab === "screen" ? undefined : (name) => go({ [deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : "browser"]: name })}
              />
            </ReportCard>
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

function keywordEmpty(data: Dash, tab: string, domain: string, t: (key: string) => string) {
  if (tab === "google_kw" && !data.searchTerms?.google.configured && !(data.searchTerms?.google.rows || []).length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
        <p>{t("还没连接 Google Search Console，所以看不到谷歌搜索词。")}</p>
        <a href={`/sites/${encodeURIComponent(domain)}/settings?tab=integrations`} className="analytics-config-link mt-3">{t("去集成里连接")} ↗</a>
      </div>
    )
  }
  if (tab === "bing_kw" && !data.searchTerms?.bing.configured && !(data.searchTerms?.bing.rows || []).length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
        <p>{t("还没连接 Bing Webmaster，所以看不到必应搜索词。")}</p>
        <a href={`/sites/${encodeURIComponent(domain)}/settings?tab=integrations`} className="analytics-config-link mt-3">{t("去集成里连接")} ↗</a>
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

function deviceRows(data: Dash, tab: string, locale: string) {
  if (tab === "os") return data.os
  if (tab === "device") return data.devices
  if (tab === "language") return (data.languages || []).map((r) => ({ ...r, label: languageName(r.name, locale) }))
  if (tab === "screen") return data.screens || []
  return data.browsers
}

