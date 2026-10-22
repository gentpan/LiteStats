import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { AnalyticsDashboard } from "../src/components/AnalyticsDashboard"
import { I18nProvider } from "../src/lib/i18n"
import { parseDashSearch } from "../src/lib/range"

const data: ComponentProps<typeof AnalyticsDashboard>["data"] = {
  mapboxToken: "",
  site: {id: 1, domain: "view.test", name: "Test", timezone: "UTC", team_id: 1, public: false, allowed_event_props: null},
  range: {from: "2026-10-21", to: "2026-10-21"},
  overview: {visitors: 9, visits: 10, pageviews: 12, bounce_rate: 50, views_per_visit: 1.2, visit_duration: 3, live: 2},
  compare: {visitors: 8, visits: 9, pageviews: 10, bounce_rate: 50, views_per_visit: 1.1, visit_duration: 3},
  series: [], seriesBy: {visitors: [], visits: [], pageviews: [], bounce_rate: [], views_per_visit: [], visit_duration: []},
  sources: [{name: "Google", value: 9}], pages: [{name: "/docs", value: 9}], countries: [{name: "CN", value: 9}],
  entryPages: [], exitPages: [], regions: [], cities: [], browsers: [], devices: [], os: [], utm: [], campaigns: [], channels: [], utmMediums: [], hostnames: [], liveGeo: [], heatmap: [], titles: [], languages: [], screens: [], queries: [], keywords: [],
  searchTerms: {google: {configured: false, rows: []}, bing: {configured: false, rows: []}, organic: []},
}

async function render(readonly: boolean) {
  const root = createRootRoute({component: () => <I18nProvider locale="zh-CN"><AnalyticsDashboard data={data} domain="view.test"
    search={parseDashSearch({period: "7d", source: "Google"})} readonly={readonly} canManage={false} onSearch={() => {}}
  /></I18nProvider>})
  const router = createRouter({routeTree: root, history: createMemoryHistory({initialEntries: ["/"]})})
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

test("member and share views retain the same metrics, report groups and active filters", async () => {
  for (const readonly of [false, true]) {
    const html = await render(readonly)
    for (const text of ["独立访客", "总会话", "总浏览量", "访客分布", "热门页面", "浏览器", "来源 Google", "清除筛选"]) {
      expect(html).toContain(text)
    }
    expect(html.includes("/sites/view.test/activity")).toBe(!readonly)
    expect(html).not.toContain("/sites/view.test/settings")
    expect(html).not.toContain("recent-visitors-dialog")
    expect(html).toContain("map-viewport")
    expect(html).toContain('aria-label="放大"')
    expect(html).toContain('aria-label="缩小"')
    expect(html).toContain("重置")
    expect(html).not.toContain("<iframe")
    expect(html).not.toContain("Google Maps")
    expect(html).not.toContain("Mapbox")
  }
})
