import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteHealthPanel } from "../src/components/SiteHealthPanel"
import type { SiteCheckReport } from "../src/lib/site-checks"

const report: SiteCheckReport = {enabled: false, path: "/", url: "https://example.com/", now: "2026-10-22T12:00:00Z", expiry: null, latest: null, checks: []}

test("health view keeps unknown data neutral and distinguishes paused and stale checks", () => {
  const html = renderToStaticMarkup(<SiteHealthPanel report={report}/>)
  expect(html).toContain("已暂停")
  expect(html).toContain("尚无到期信息")
  expect(html).not.toContain("100.0%")
  expect(html).not.toContain("正常访问")
  const check = {checkedAt: "2026-10-22T10:00:00Z", ok: true, status: 200, durationMs: 100, error: null}
  const stale = renderToStaticMarkup(<SiteHealthPanel report={{...report, enabled: true, latest: check, checks: [check]}}/>)
  expect(stale).toContain("等待检查")
  expect(stale).not.toContain("正常访问")
})

test("health view shows expiry countdowns and HTTP failures without host/provider details", () => {
  const check = {checkedAt: "2026-10-22T11:59:00Z", ok: false, status: 503, durationMs: 100, error: "HTTP 503"}
  const html = renderToStaticMarkup(<SiteHealthPanel report={{...report, enabled: true, latest: check, checks: [check], expiry: {
    checkedAt: report.now, domain: {domain: "example.com", expiresAt: "2027-01-01T00:00:00Z", registeredAt: "2020-05-01T00:00:00Z", registrar: "Example Registrar", error: null}, certificate: {expiresAt: "2026-11-01T00:00:00Z", valid: true, validation: "DV", error: null},
  }}}/>)
  expect(html).toContain("访问异常")
  expect(html).toContain("HTTP 503")
  expect(html).toContain("域名到期")
  expect(html).toContain("证书到期")
  expect(html).toContain("注册日期")
  expect(html).toContain("2020年5月1日")
  expect(html).toContain("Example Registrar")
  expect(html).toContain("DV · 域名验证")
  expect(html).toContain("0.0%")
  expect(html).not.toContain("运营商")
  expect(html).not.toContain("服务器性能")
})

test("cached expiry dates are labelled as previous results after a failed query", () => {
  const html = renderToStaticMarkup(<SiteHealthPanel report={{...report, expiry: {
    checkedAt: report.now,
    domain: {domain: "example.com", expiresAt: "2027-01-01T00:00:00Z", error: "检查超时", stale: true, lastSuccessAt: "2026-10-20T12:00:00Z"},
    certificate: {expiresAt: "2026-11-01T00:00:00Z", valid: false, error: "检查超时", stale: true, lastSuccessAt: "2026-10-20T12:00:00Z"},
  }}}/>)
  expect(html.match(/本次查询失败，显示上次结果/g)).toHaveLength(2)
  expect(html).toContain("2026/10/20 12:00:00 UTC")
  expect(html).toContain("health-tone-warning")
  expect(html).not.toContain("证书已过期")
})

test("WHOIS date precision and missing expiry are clear in the health cards", () => {
  const expiry = {
    checkedAt: report.now,
    domain: {domain: "cnnic.cn", expiresAt: "2028-03-10", error: null},
    certificate: {expiresAt: "2026-11-27T23:59:59Z", valid: true, error: null},
  }
  const html = renderToStaticMarkup(<SiteHealthPanel report={{...report, expiry}}/>)
  expect(html).toContain("2028年3月10日</span>")
  expect(html).toContain("按公开日期估算剩余天数")
  expect(html).toContain("2026年11月27日 UTC")
  const error = "WHOIS 未返回该域名的到期时间，请到注册商查看"
  const missing = renderToStaticMarkup(<SiteHealthPanel report={{...report, expiry: {...expiry, domain: {...expiry.domain, expiresAt: null, error}}}}/>)
  expect(missing).toContain("未能获取到期信息")
  expect(missing).toContain(error)
  expect(missing).not.toContain("已到期")
  expect(missing).not.toContain("按公开日期估算剩余天数")
})

test("health timestamps and chart titles do not depend on the server or browser timezone", () => {
  const originalTimezone = process.env.TZ
  const check = {checkedAt: "2026-10-22T11:59:00Z", ok: true, status: 200, durationMs: 100, error: null}
  const data = {...report, enabled: true, latest: check, checks: [check], expiry: {
    checkedAt: report.now,
    domain: {domain: "example.com", expiresAt: "2027-01-01T00:00:00Z", error: null},
    certificate: {expiresAt: "2026-11-01T00:00:00Z", valid: true, error: null},
  }}
  try {
    process.env.TZ = "UTC"
    const server = renderToStaticMarkup(<SiteHealthPanel report={data}/>)
    for (const timezone of ["Asia/Tashkent", "America/Los_Angeles"]) {
      process.env.TZ = timezone
      expect(renderToStaticMarkup(<SiteHealthPanel report={data}/>)).toBe(server)
    }
    expect(server).toContain("2026/10/22 11:59:00 UTC")
    expect(server).toContain("2026/10/22 12:00:00 UTC")
    expect(server).toContain('title="10/21 12:00 UTC')
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  }
})
