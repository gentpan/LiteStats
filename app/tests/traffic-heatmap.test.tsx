import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TrafficHeatmap, type HeatCell } from "../src/components/TrafficHeatmap"
import { I18nProvider, type Locale } from "../src/lib/i18n"

function render(cells: HeatCell[], locale: Locale = "zh-CN") {
  return renderToStaticMarkup(<I18nProvider locale={locale}><TrafficHeatmap cells={cells} /></I18nProvider>)
}

test("hourly bars show the busiest weekday without adding visitors from other weekdays", () => {
  const html = render([{ dow: 3, hour: 7, value: 12 }, { dow: 4, hour: 7, value: 20 }, { dow: 4, hour: 13, value: 30 }])
  const chart = html.slice(html.indexOf('class="traffic-hourly-chart"'))
  expect(chart).toContain('aria-label="周四每小时访客"')
  expect(chart.match(/class="traffic-hourly-slot"/g)).toHaveLength(24)
  expect(chart).toContain('aria-label="周四 07:00 · 20 访客"')
  expect(chart).toContain('aria-label="周四 13:00 · 30 访客"')
  expect(chart).toContain('aria-label="周四 23:00 · 0 访客"')
  expect(chart).not.toContain("32 访客")
  expect(chart).not.toContain("暂无数据")
})

test("empty and zero traffic keep a stable, honest chart in both languages", () => {
  for (const cells of [[], [{ dow: 5, hour: 9, value: 0 }]]) {
    for (const locale of ["zh-CN", "en"] as const) {
      const html = render(cells, locale)
      expect(html).not.toMatch(/NaN|Infinity/)
      expect(html.match(/class="traffic-hourly-slot"/g)).toHaveLength(24)
      expect(html).toContain(locale === "en" ? "No data" : "暂无数据")
      if (locale === "en") expect(html).not.toMatch(/[\u4e00-\u9fff]/)
    }
  }
})
