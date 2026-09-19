import { Surface } from "~/components/Surface"
import { TrafficHeatmap } from "~/components/TrafficHeatmap"
import { PageState } from "~/components/PageState"
import { useT } from "~/lib/i18n"
import type { SearchSchemaInput } from "@tanstack/react-router"
import type { DashSearch } from "~/lib/range"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { DashTopBar } from "~/components/DashTopBar"
import { Shell } from "~/components/Shell"
import { VisitorGraph } from "~/components/VisitorGraph"
import { MapCard } from "~/components/WorldMap"
import { List, ReportCard, ReportMenu } from "~/components/ui"
import { shareDashboardFn } from "~/lib/actions"
import type { MetricKey } from "~/lib/ch"
import { countryName } from "~/lib/countries"
import { languageName } from "~/lib/languages"
import { downloadDashboardZip } from "~/lib/export"
import { dashInput, isoDate, parseDashSearch, parseDate } from "~/lib/range"

export const Route = createFileRoute("/share/$slug")({
  validateSearch: (search: Partial<DashSearch> & SearchSchemaInput) => parseDashSearch(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const data = await shareDashboardFn({ data: { ...dashInput(params.slug, deps), slug: params.slug } })
    return { data }
  },
  component: SharePage,
  errorComponent: ({ error }) => (
    <PageState title="分享链接无效" description={error instanceof Error ? error.message : undefined} />
  ),
})

function SharePage() {
  const { t, locale } = useT()
  const { data } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const { slug } = Route.useParams()
  const [metric, setMetric] = useState<MetricKey>("visitors")
  const [sourceTab, setSourceTab] = useState("source")
  const [pageTab, setPageTab] = useState("pages")
  const [pageMode, setPageMode] = useState("path")
  const [locationTab, setLocationTab] = useState("countries")
  const [deviceTab, setDeviceTab] = useState("browser")
  const countries = data.countries.map((r) => ({ ...r, label: countryName(r.name, locale) }))

  function go(next: Partial<typeof search>) {
    void router.navigate({ to: "/share/$slug", params: { slug }, search: parseDashSearch({ ...search, ...next }) })
  }

  const sourceList = sourceTab === "channel"
    ? data.channels
    : sourceTab === "utm_medium"
      ? data.utmMediums
      : sourceTab === "utm_source"
        ? data.utm
        : sourceTab === "utm_campaign"
          ? data.campaigns
          : sourceTab === "google_kw"
            ? (data.searchTerms?.google.rows || [])
            : sourceTab === "bing_kw"
              ? (data.searchTerms?.bing.rows || [])
              : sourceTab === "organic_kw"
                ? (data.searchTerms?.organic || data.keywords || [])
                : data.sources

  const pageList = pageMode === "hostname"
    ? data.hostnames
    : pageTab === "title"
      ? (data.titles || [])
      : pageTab === "query"
        ? (data.queries || [])
        : (pageTab === "entry" ? data.entryPages : pageTab === "exit" ? data.exitPages : data.pages).map((r) => ({
            ...r,
            href: r.name.startsWith("http") ? r.name : `https://${data.site.domain}${r.name.startsWith("/") ? "" : "/"}${r.name}`,
          }))
  const deviceList = deviceTab === "os"
    ? data.os
    : deviceTab === "device"
      ? data.devices
      : deviceTab === "language"
        ? (data.languages || []).map((r) => ({ ...r, label: languageName(r.name, locale) }))
        : deviceTab === "screen"
          ? (data.screens || [])
          : data.browsers

  return (
    <Shell>
      <div className="mb-16 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        <DashTopBar
          domain={data.site.domain}
          live={data.overview.live}
          filterOptions={{page:data.pages,source:data.sources,country:data.countries.map(row=>({...row,label:countryName(row.name,locale)})),device:data.devices,browser:data.browsers,os:data.os}}
          search={search}
          onPeriod={go}
          readonly
          onExport={() => downloadDashboardZip({
            domain: data.site.domain,
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
        />

            <ReportCard className="location-report col-span-full"
          tabs={[{ id: "countries", label: "国家/地区" }, { id: "regions", label: "地区" }, { id: "cities", label: "城市" }]}
          active={locationTab}
          onChange={setLocationTab}
          details={{
            title: locationTab === "regions" ? t("地区") : locationTab === "cities" ? t("城市") : t("国家/地区"),
            kind: locationTab === "regions" ? "region" : locationTab === "cities" ? "city" : "country",
            rows: locationTab === "regions" ? data.regions : locationTab === "cities" ? data.cities : countries,
          }}
        >
          <List compact
            plain
            kind={locationTab === "regions" ? "region" : locationTab === "cities" ? "city" : "country"}
            rows={locationTab === "regions" ? data.regions : locationTab === "cities" ? data.cities : countries}
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
            title: sourceTab === "channel" ? t("渠道") : sourceTab === "utm_medium" ? t("UTM 媒介") : sourceTab === "utm_source" ? t("UTM 来源") : sourceTab === "utm_campaign" ? t("UTM 活动") : t("来源"),
            kind: sourceTab === "source" ? "source" : sourceTab === "channel" ? "channel" : sourceTab.endsWith("_kw") ? "keyword" : "campaign",
            rows: sourceList,
          }}
        >
          <List
            plain
            kind={sourceTab === "source" ? "source" : sourceTab === "channel" ? "channel" : sourceTab.endsWith("_kw") ? "keyword" : "campaign"}
            rows={sourceList}
          />
        </ReportCard>
        <ReportCard
          tabs={[{ id: "pages", label: "热门页面" }, { id: "entry", label: "进入页" }, { id: "exit", label: "退出页" }, { id: "title", label: "标题" }, { id: "query", label: "查询" }]}
          active={pageTab}
          onChange={setPageTab}
          extra={<ReportMenu value={pageMode} onChange={setPageMode} options={[{ id: "path", label: "路径" }, { id: "hostname", label: "网址" }]} />}
          details={{
            title: pageMode === "hostname" ? t("主机名") : pageTab === "entry" ? t("进入页") : pageTab === "exit" ? t("退出页") : pageTab === "title" ? t("标题") : pageTab === "query" ? t("查询") : t("热门页面"),
            kind: pageMode === "hostname" ? "hostname" : pageTab === "title" ? "title" : pageTab === "query" ? "query" : "page",
            rows: pageList,
          }}
        >
          <List plain kind={pageMode === "hostname" ? "hostname" : pageTab === "title" ? "title" : pageTab === "query" ? "query" : "page"} rows={pageList} />
        </ReportCard>
        <Surface className="analytics-panel traffic-report"><TrafficHeatmap cells={data.heatmap || []} /></Surface>
        <ReportCard
          tabs={[{ id: "browser", label: "浏览器" }, { id: "os", label: "操作系统" }, { id: "device", label: "设备" }, { id: "language", label: "语言" }, { id: "screen", label: "屏幕" }]}
          active={deviceTab}
          onChange={setDeviceTab}
          details={{
            title: deviceTab === "os" ? t("操作系统") : deviceTab === "device" ? t("设备") : deviceTab === "language" ? t("语言") : deviceTab === "screen" ? t("屏幕") : t("浏览器"),
            kind: deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser",
            rows: deviceList,
          }}
        >
          <List
            plain
            kind={deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser"}
            rows={deviceList}
          />
        </ReportCard>
      </div>
    </Shell>
  )
}
