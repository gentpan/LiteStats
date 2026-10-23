import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { geographyLabel, subdivisionCode } from "../src/lib/geography"
import { reportSearchText } from "../src/lib/report-values"
import { I18nProvider } from "../src/lib/i18n"
import { List } from "../src/components/ui"
import subdivisions from "../src/assets/subdivisions.json"
import { Converter } from "opencc-js/t2cn"

test("imported subdivision codes display full country and region names in both locales", () => {
  for (const [stored, country, zh, en] of [
    ["CN-BJ", "CN", "中国 · 北京市", "China mainland · Beijing"],
    ["CN-GD", "CN", "中国 · 广东省", "China mainland · Guangdong"],
    ["UZ-TK", "UZ", "乌兹别克斯坦 · 塔什干", "Uzbekistan · Tashkent"],
    ["US-CA", "US", "美国 · 加利福尼亚州", "United States · California"],
    ["WA", "AU", "澳大利亚 · 西澳大利亚州", "Australia · Western Australia"],
  ]) {
    expect(geographyLabel("region", stored, country, "zh-CN")).toBe(zh!)
    expect(geographyLabel("region", stored, country, "en")).toBe(en!)
  }
  expect(geographyLabel("region", "CN-BJ", "", "zh-CN")).toBe("中国 · 北京市")
})

test("provider names resolve to the historical subdivision identity without changing counts", () => {
  expect(subdivisionCode("CN", "北京")).toBe("CN-BJ")
  expect(subdivisionCode("CN", "北京市")).toBe("CN-BJ")
  expect(subdivisionCode("US", "California")).toBe("US-CA")
  expect(subdivisionCode("UZ", "Tashkent")).toBe("UZ-TK")
  expect(geographyLabel("city", "Tashkent", "UZ", "zh-CN")).toBe("乌兹别克斯坦 · 暂无中文名称")
  expect(geographyLabel("city", "Mountain View", "US", "zh-CN")).toBe("美国 · 暂无中文名称")
  expect(geographyLabel("city", "5809844", "US", "zh-CN")).toBe("美国 · 未知城市")
  expect(geographyLabel("region", "US-ZZZ", "US", "zh-CN")).toBe("美国 · 未知地区")
  const row = {name: "CN-BJ", code: "CN", value: 1300}
  expect(reportSearchText("region", row, "zh-CN")).toContain("北京市")
  expect(reportSearchText("region", row, "zh-CN")).toContain("CN-BJ")
  const html = renderToString(<I18nProvider locale="zh-CN"><List rows={[row]} kind="region" plain/></I18nProvider>)
  expect(html).toContain('title="中国 · 北京市"')
  expect(html).toContain("1.3k")
  expect(row).toEqual({name: "CN-BJ", code: "CN", value: 1300})
})

test("Chinese geography labels and searches use simplified characters for codes, names and provider fallbacks", () => {
  expect(geographyLabel("region", "US-CO", "US", "zh-CN")).toBe("美国 · 科罗拉多州")
  expect(geographyLabel("region", "科羅拉多州", "US", "zh-CN")).toBe("美国 · 科罗拉多州")
  expect(subdivisionCode("US", "科罗拉多州")).toBe("US-CO")
  expect(subdivisionCode("US", "科羅拉多州")).toBe("US-CO")
  expect(geographyLabel("city", "維多利亞市", "CA", "zh-CN")).toBe("加拿大 · 维多利亚市")
  expect(geographyLabel("region", "US-CO", "US", "en")).toBe("United States · Colorado")
  const row = {name:"科羅拉多州",code:"US",value:19}
  expect(reportSearchText("region", row, "zh-CN")).toContain("美国 · 科罗拉多州")
  const html = renderToString(<I18nProvider locale="zh-CN"><List rows={[row]} kind="region" plain/></I18nProvider>)
  expect(html).toContain('title="美国 · 科罗拉多州"')
  expect(html).not.toContain("科羅")
  expect(row.name).toBe("科羅拉多州")
})

test("every Chinese subdivision display is simplified while English names remain unchanged", () => {
  const simplify = Converter({from:"t",to:"cn"})
  for (const [key, translations] of Object.entries(subdivisions)) {
    const country = key.slice(0,2).toUpperCase()
    const code = `${country}-${key.slice(2).toUpperCase()}`
    const chinese = geographyLabel("region", code, country, "zh-CN")
    expect(chinese).toBe(simplify(chinese))
    if (translations[0]) expect(geographyLabel("region", code, country, "en")).toEndWith(` · ${translations[0]}`)
  }
})
