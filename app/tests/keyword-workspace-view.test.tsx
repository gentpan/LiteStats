import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { KeywordTable } from "../src/components/KeywordTable"
import { KeywordImportPanel } from "../src/components/KeywordImportPanel"
import { KeywordSeoPanel } from "../src/components/KeywordSeoPanel"
import { I18nProvider } from "../src/lib/i18n"
import type { SeoAiPublicConfig, SeoAiReport } from "../src/lib/seo-ai"
import type { ReactNode } from "react"

const config: SeoAiPublicConfig = {endpoint: "https://api.example.com/v1/chat/completions", model: "fixture-model", hasKey: true, tokenParameter: "max_completion_tokens"}
const history: SeoAiReport[] = [{id: 1, createdAt: "2026-10-22T12:00:00Z", provider: "google", from: "2026-10-01", to: "2026-10-21", scopeLabel: "Fixture CSV", model: "fixture-model",
  summary: '<script>alert("summary")</script>', suggestions: [{keyword: '<img src=x onerror="alert(1)">', reason: '<a href="javascript:alert(1)">reason</a>', action: "Check only after validation", priority: "high"}]}]
const render = (node: ReactNode) => renderToStaticMarkup(<I18nProvider locale="zh-CN">{node}</I18nProvider>)
const noGenerate = async () => ({ok: false, error: "no_data", message: "No fixture data"} as const)

test("keyword rows preserve long text and distinguish unavailable metrics from real zero", () => {
  const keyword = '<script>alert("keyword")</script>' + "长关键词".repeat(200)
  const html = render(<KeywordTable rows={[
    {query: keyword, clicks: 0, impressions: null, ctr: null, position: null},
    {query: "Zero metrics", clicks: 0, impressions: 0, ctr: 0, position: 0},
  ]}/>)
  expect(html).not.toContain("<script>")
  expect(html).toContain("&lt;script&gt;")
  expect(html).toContain("长关键词".repeat(200))
  expect(html.match(/<dd>—<\/dd>/g)).toHaveLength(3)
  expect(html).toContain("<dd>0%</dd>")
  expect(html).toContain("<dt>平均排名</dt><dd>0</dd>")
})

test("keyword list renders only its first page while keeping metric labels accessible", () => {
  const rows = Array.from({length: 26}, (_, i) => ({query: `Term-${i}`, clicks: i, impressions: 100, ctr: .01, position: 2}))
  const html = render(<KeywordTable rows={rows}/>)
  expect(html).toContain("Term-24")
  expect(html).not.toContain("Term-25")
  expect(html).toContain("显示 1–25，共 26 条")
  expect(html).toContain("<dt>展现量</dt>")
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>上一页<\/button>/)
  expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>下一页<\/button>/)
})

test("AI panel renders model output as text and never generates automatically", () => {
  let generated = false
  const html = render(<KeywordSeoPanel domain="example.com" config={config} history={history} sourceLabel="Current report" canGenerate onGenerate={async () => {generated = true; return noGenerate()}}/>)
  expect(generated).toBe(false)
  expect(html).not.toContain("<script>")
  expect(html).not.toContain("<img src=x")
  expect(html).not.toContain('<a href="javascript:')
  expect(html).toContain("&lt;script&gt;")
  expect(html).toContain("&lt;img")
  expect(html).toContain("type=\"password\"")
  expect(html).toContain("留空保留已保存的密钥")
})

test("AI generate is disabled without either a saved key or usable report data", () => {
  for (const [hasKey, canGenerate] of [[false, true], [true, false], [false, false]]) {
    const html = render(<KeywordSeoPanel domain="example.com" config={{...config, hasKey}} history={[]} sourceLabel="Current report" canGenerate={canGenerate} onGenerate={noGenerate}/>)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>生成建议<\/button>/)
  }
  const html = render(<KeywordImportPanel domain="example.com" onImported={() => {throw new Error("render must not import")}}/>)
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>确认导入<\/button>/)
  expect(html).toContain('accept=".csv,text/csv"')
})

test("AI history timestamp text is stable across server and browser timezones", () => {
  const previous = process.env.TZ
  const markup = () => render(<KeywordSeoPanel domain="example.com" config={config} history={history} sourceLabel="Current report" canGenerate onGenerate={noGenerate}/>)
  try {
    process.env.TZ = "UTC"
    const utc = markup()
    for (const timezone of ["Asia/Tashkent", "America/Los_Angeles"]) {
      process.env.TZ = timezone
      expect(markup()).toBe(utc)
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
