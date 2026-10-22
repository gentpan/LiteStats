import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nProvider } from "../src/lib/i18n"
import { TrackingDocs } from "../src/components/TrackingDocs"

test("tracking documentation retains the collector and custom events without retired key APIs", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const html = renderToStaticMarkup(<I18nProvider locale={locale}><TrackingDocs domain="docs.example.test" /></I18nProvider>)
    for (const text of ["POST /api/event", "docs.example.test", "/script.js", "litestats.track"]) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain("/api/v1/")
    expect(html).not.toContain("API Key")
    expect(html).not.toContain("个人 API 密钥")
    for (const text of locale === "en" ? ["defer", "5 minutes", "document entry referrer", "not durable storage", "avoid double counting"] : ["defer", "5 分钟", "入站来源", "不代表已经持久化", "以免重复计数"]) {
      expect(html).toContain(text)
    }
  }
})
