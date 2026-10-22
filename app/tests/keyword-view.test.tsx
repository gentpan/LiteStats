import {expect, test} from "bun:test"
import {renderToStaticMarkup} from "react-dom/server"
import {KeywordReport, keywordView} from "../src/components/KeywordReport"
import {List} from "../src/components/ui"
import {I18nProvider} from "../src/lib/i18n"
import type {SearchTerms} from "../src/lib/keywords"

const empty: SearchTerms = {google: {configured: false, rows: []}, bing: {configured: false, rows: []}, organic: []}
function markup(terms: SearchTerms, tab: string, canManage = false, locale: "zh-CN" | "en" = "zh-CN") {
  return renderToStaticMarkup(<I18nProvider locale={locale}><KeywordReport view={keywordView(terms, tab)!} domain="example.test" canManage={canManage} onPeriod={() => {}} /></I18nProvider>)
}

test("official keywords use click counts in both normal and expanded lists; referrers use visitors", () => {
  const terms: SearchTerms = {...empty, google: {configured: true, rows: [{name: "统计工具", value: 12}]}, bing: {configured: true, rows: [{name: "site analytics", value: 9}]}, organic: [{name: "网站统计", value: 3}]}
  for (const tab of ["google_kw", "bing_kw", "organic_kw"]) {
    const view = keywordView(terms, tab)!
    for (const expanded of [false, true]) {
      const html = renderToStaticMarkup(<I18nProvider locale="zh-CN"><List plain expanded={expanded} kind="keyword" rows={view.rows} columns={view.columns} /></I18nProvider>)
      expect(html).toContain(tab === "organic_kw" ? ">访客<" : ">点击<")
      expect(html).not.toContain(tab === "organic_kw" ? ">点击<" : ">访客<")
      if (tab !== "organic_kw") expect(html).not.toMatch(/>[\d.]+%</)
    }
  }
  expect(markup(terms, "google_kw")).toContain("太平洋时间")
  expect(markup(terms, "bing_kw")).toContain("不跟随上方日期")
  for (const tab of ["google_kw", "bing_kw"]) {
    expect(keywordView(terms, tab)?.description).toContain("所选资源")
    expect(keywordView(terms, tab)?.description).not.toContain("整站")
  }
  expect(keywordView(terms, "source")).toBeNull()
})

test("disconnected, failed, unsupported and empty responses remain distinguishable", () => {
  expect(markup(empty, "google_kw")).toContain("还没连接 Google Search Console")
  const timeout: SearchTerms = {...empty, google: {configured: false, rows: [], error: "request_timeout"}}
  expect(markup(timeout, "google_kw")).toContain("响应超时")
  expect(markup(timeout, "google_kw")).not.toContain("还没连接")
  for (const [error, message] of [["auth_error", "授权已失效"], ["property_required", "选择并保存"], ["request_failed", "暂时无法读取"], ["period_unsupported", "查看近 28 天"]] as const) {
    const terms: SearchTerms = {...empty, google: {configured: true, rows: [], error}}
    expect(markup(terms, "google_kw")).toContain(message)
    expect(markup(terms, "google_kw")).not.toContain("还没连接")
  }
  expect(markup({...empty, google: {configured: true, rows: []}}, "google_kw")).toContain("暂未返回关键词")
  expect(markup(empty, "organic_kw")).toContain("当前范围没有可识别的搜索词")
})

test("only managers see configuration links; translations and safe text survive", () => {
  expect(markup(empty, "google_kw", true)).toContain("/sites/example.test/settings?tab=integrations")
  expect(markup(empty, "google_kw", false)).not.toContain("/settings")
  expect(markup(empty, "organic_kw", false)).not.toContain("/settings")
  expect(markup(empty, "organic_kw", true, "en")).toContain("No identifiable search terms")
  const terms: SearchTerms = {...empty, google: {configured: true, rows: [{name: '<script>alert("keyword")</script>', value: 10}]}}
  const html = markup(terms, "google_kw", false, "en")
  expect(html).toContain(">Clicks<")
  expect(html).not.toContain("<script>")
  expect(html).toContain("&lt;script&gt;")
})
