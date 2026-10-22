import { UIIcon } from "./UIIcon"
import { HelpHint } from "./HelpHint"
import { useState } from "react"
import { Surface } from "./Surface"
import { TrafficHeatmap } from "./TrafficHeatmap"
import { DashTopBar } from "./DashTopBar"
import { VisitorGraph } from "./VisitorGraph"
import { MapCard } from "./WorldMap"
import { List, ReportCard, ReportMenu } from "./ui"
import { KeywordReport, keywordView } from "./KeywordReport"
import { useT } from "~/lib/i18n"
import { countryName } from "~/lib/countries"
import { languageName } from "~/lib/languages"
import { isDirectSource } from "~/lib/source-icons"
import { RowIcon } from "./icons"
import { reportValueLabel } from "~/lib/report-values"
import type { dashboardFn } from "~/lib/actions"
import type { MetricKey } from "~/lib/ch"
import { downloadDashboardZip } from "~/lib/export"
import { isoDate, parseDashSearch, parseDate, type DashSearch } from "~/lib/range"

type DashboardData = Omit<Awaited<ReturnType<typeof dashboardFn>>, "access">

/** Shared report display; route loaders retain their own authorization and data access. */
export function AnalyticsDashboard({data, domain, search, onSearch, readonly = true, canManage = false}: {
  data: DashboardData
  domain: string
  search: DashSearch
  onSearch: (search: DashSearch) => void
  readonly?: boolean
  canManage?: boolean
}) {
  const { t, locale } = useT()
  const [metric, setMetric] = useState<MetricKey>("visitors")
  const [sourceTab, setSourceTab] = useState("source")
  const [pageTab, setPageTab] = useState("pages")
  const [pageMode, setPageMode] = useState("path")
  const [locationTab, setLocationTab] = useState("countries")
  const [deviceTab, setDeviceTab] = useState("browser")
  const chips = [
    search.source && { key: "source" as const, label: t("来源 {0}", {0: isDirectSource(search.source) ? t("直接访问") : search.source}) },
    search.page && { key: "page" as const, label: t("页面 {0}", {0: search.page}) },
    search.country && { key: "country" as const, label: t("地区 {0}", {0: countryName(search.country, locale)}) },
    search.browser && { key: "browser" as const, label: t("浏览器 {0}", {0: reportValueLabel("browser", search.browser, locale)}) },
    search.os && { key: "os" as const, label: t("系统 {0}", {0: reportValueLabel("os", search.os, locale)}) },
    search.device && { key: "device" as const, label: t("设备 {0}", {0: search.device}) },
  ].filter(Boolean) as Array<{ key: "source" | "page" | "country" | "browser" | "os" | "device", label: string }>

  function go(next: Partial<DashSearch>) {
    onSearch(parseDashSearch({ ...search, ...next }))
  }

  const countries = data.countries.map((r) => ({ ...r, label: countryName(r.name, locale) }))
  const keywords = keywordView(data.searchTerms, sourceTab)
  const deviceReportTitle = deviceTab === "os" ? t("操作系统") : deviceTab === "device" ? t("设备") : deviceTab === "language" ? t("语言") : deviceTab === "screen" ? t("屏幕") : t("浏览器")

  return (
    <div className="analytics-dashboard mb-16 grid min-w-0 grid-cols-1 md:grid-cols-2">
      <DashTopBar
        domain={domain}
        live={data.overview.live}
        filterOptions={{page:data.pages,source:data.sources.map(row=>({...row,label:isDirectSource(row.name) ? t("直接访问") : row.name})),country:data.countries.map(row=>({...row,label:countryName(row.name,locale)})),device:data.devices,browser:data.browsers,os:data.os}}
        search={search}
        onPeriod={go}
        readonly={readonly}
        canManage={canManage}
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
            <button key={c.key} type="button" className="squircle active-filter-chip flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-sm" onClick={() => go({ [c.key]: "" })}>
              {c.key !== "page" ? <span className="report-value-icon"><RowIcon kind={c.key} name={String(search[c.key] || "")}/></span> : null}
              <span className="min-w-0 [overflow-wrap:anywhere]">{t(c.label)}</span>
              <UIIcon name="close" className="ml-1.5 size-3"/>
            </button>
          ))}
          <button type="button" className="squircle control-compact text-sm text-gray-500 hover:text-gray-900" onClick={() => go({ source: "", page: "", country: "", browser: "", os: "", device: "" })}>{t("清除筛选")}</button>
        </div>
      ) : null}

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
        mapboxToken={data.mapboxToken}
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

      <ReportCard className="source-report"
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
        extra={keywords ? <HelpHint>{t(keywords.description)}</HelpHint> : undefined}
        details={{
          title: sourceTab === "channel" ? t("渠道") : sourceTab === "utm_medium" ? t("UTM 媒介") : sourceTab === "utm_source" ? t("UTM 来源") : sourceTab === "utm_campaign" ? t("UTM 活动") : sourceTab === "google_kw" ? t("Google 搜索词") : sourceTab === "bing_kw" ? t("Bing 搜索词") : sourceTab === "organic_kw" ? t("引荐搜索词") : t("来源"),
          kind: sourceTab === "source" ? "source" : sourceTab === "channel" ? "channel" : sourceTab.endsWith("_kw") ? "keyword" : "campaign",
          rows: sourceRows(data, sourceTab),
          columns: keywords?.columns,
          onPick: sourceTab === "source" ? (name) => go({ source: name }) : undefined,
        }}
      >
        {keywords ? <KeywordReport view={keywords} domain={domain} canManage={canManage} onPeriod={() => go({period: "28d"})} /> : (
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

      <Surface className="analytics-panel traffic-report traffic-paired-report"><TrafficHeatmap cells={data.heatmap || []} /></Surface>

      <ReportCard className="device-report traffic-paired-report"
        tabs={[{ id: "browser", label: "浏览器" }, { id: "os", label: "操作系统" }, { id: "device", label: "设备" }, { id: "language", label: "语言" }, { id: "screen", label: "屏幕" }]}
        active={deviceTab}
        onChange={setDeviceTab}
        details={{
          title: deviceReportTitle,
          kind: deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser",
          rows: deviceRows(data, deviceTab, locale),
          onPick: deviceTab === "language" || deviceTab === "screen" ? undefined : (name) => go({ [deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : "browser"]: name }),
        }}
      >
        <div key={deviceTab} className="device-report-scroll" role="region" aria-label={deviceReportTitle} tabIndex={0}>
          <List
            plain
            maxItems={0}
            kind={deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : deviceTab === "language" ? "language" : deviceTab === "screen" ? "screen" : "browser"}
            rows={deviceRows(data, deviceTab, locale)}
            onPick={deviceTab === "language" || deviceTab === "screen" ? undefined : (name) => go({ [deviceTab === "os" ? "os" : deviceTab === "device" ? "device" : "browser"]: name })}
          />
        </div>
      </ReportCard>

    </div>
  )
}

type Dash = DashboardData

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
