import { expect, test } from "bun:test"
import { createMemoryHistory, createRootRoute, createRouter, Outlet, RouterProvider, type AnyRoute } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { I18nProvider } from "../src/lib/i18n"
import { Route as SettingsRoute } from "../src/routes/sites/$domain.settings"
import { Route as DashboardRoute } from "../src/routes/dashboard"

const fixture = {
  me: {id: 1, name: "Fixture", email: "fixture@example.test", theme: "light", locale: "zh-CN"},
  data: {
    site: {id: 42, name: "Test site", domain: "example.test", timezone: "UTC", public: false},
    shares: [], google: null, bing: null,
    googleOAuth: {clientId: "", hasSecret: false, configured: false, redirectUri: "", error: undefined as string | undefined}, googleAuthUrl: "",
  },
}

async function render(path: string, settingsFixture: Record<string, unknown> = fixture) {
  const root = createRootRoute({component: () => <I18nProvider locale="zh-CN"><Outlet /></I18nProvider>})
  const settings: AnyRoute = SettingsRoute
  const home: AnyRoute = DashboardRoute
  const originalSettings = settings.options, originalHome = home.options
  try {
    settings.options = {...originalSettings, getParentRoute: () => root, path: "/sites/$domain/settings", loader: () => settingsFixture}
    home.options = {...originalHome, getParentRoute: () => root, path: "/dashboard", loader: () => ({me: fixture.me, sites: []})}
    const router = createRouter({routeTree: root.addChildren([settings, home]), history: createMemoryHistory({initialEntries: [path]})})
    await router.load()
    return {html: renderToString(<RouterProvider router={router} />), search: router.state.matches.at(-1)?.search as Record<string, unknown> | undefined}
  } finally {
    settings.options = originalSettings
    home.options = originalHome
  }
}

test("site integration routes preserve recognized OAuth failures and render recovery instructions", async () => {
  for (const [issue, message] of [
    ["denied", "已取消 Google 授权"],
    ["expired", "Google 授权链接已过期或已被使用"],
    ["auth_error", "Google 授权未能完成"],
    ["failed", "暂时无法完成 Google 连接"],
  ]) {
    const {html, search} = await render(`/sites/example.test/settings?tab=integrations&gsc=${issue}`)
    expect(search).toMatchObject({tab: "integrations", gsc: issue})
    expect(html).toContain('role="alert"')
    expect(html).toContain(message)
    expect(html).toContain("OAuth 只读授权")
    expect(html).toContain("普通 API Key 无法读取 Search Console 数据")
    expect(html).toContain("已保存的密钥不会回显")
    expect(html).toContain('type="password"')
  }
})

test("callback query strings cannot inject provider messages into integration or site-list alerts", async () => {
  for (const value of ["private-token-message", "__proto__", "constructor"]) {
    const {html, search} = await render(`/sites/example.test/settings?tab=integrations&gsc=${value}&error_description=provider-secret`)
    expect(search?.gsc).toBeUndefined()
    expect(html).not.toContain(value)
    expect(html).not.toContain("provider-secret")
  }
  const {html, search} = await render("/dashboard?gsc=private-token-message")
  expect(search?.gsc).toBeUndefined()
  expect(html).not.toContain("private-token-message")
})

test("the site-list page explains callback failures when a safe site destination is unavailable", async () => {
  const {html, search} = await render("/dashboard?gsc=expired")
  expect(search).toMatchObject({gsc: "expired"})
  expect(html).toContain('role="alert"')
  expect(html).toContain("Google 授权链接已失效")
  expect(html).toContain("请打开对应站点的集成设置，重新连接")
})

test("unreadable OAuth settings retain a usable reconfiguration form without displaying stored secrets", async () => {
  fixture.data.googleOAuth.error = "Google OAuth 配置无法读取，请重新填写客户端信息和密钥。"
  try {
    const {html} = await render("/sites/example.test/settings?tab=integrations")
    expect(html).toContain("Google OAuth 配置无法读取")
    expect(html).toContain("Client ID")
    expect(html).toContain("Client Secret")
    expect(html).toContain('type="password"')
    expect(html).toContain("保存配置")
    expect(html).not.toContain("litestats-secret:")
    expect(html).not.toContain("refresh_token")
  } finally {fixture.data.googleOAuth.error = undefined}
})

test("configured search connections retain account, resource and disconnect controls in separate named sections", async () => {
  const resource = "https://example.test/" + "a-long-verified-resource-path/".repeat(12)
  const {html} = await render("/sites/example.test/settings?tab=integrations", {
    ...fixture,
    data: {
      ...fixture.data,
      googleOAuth: {...fixture.data.googleOAuth, configured: true, hasSecret: true, clientId: "fixture.apps.googleusercontent.com"},
      google: {email: "owner-with-a-long-account-name@example.test", property: resource, properties: [resource]},
      bing: {site_url: resource},
    },
  })
  expect(html.match(/<section[^>]+aria-labelledby="[^"]+"/g)).toHaveLength(2)
  expect(html).toContain("owner-with-a-long-account-name@example.test")
  expect(html).toContain(`value="${resource}"`)
  expect(html).toContain("已保存密钥，留空保持不变。")
  expect(html).toContain("保存资源")
  expect(html.match(/>断开<\/button>/g)).toHaveLength(2)
  expect(html).not.toContain("连接 Google</a>")
  expect(html).not.toContain("refresh_token")
})

test("configured clients keep a visible authorization action without pretending the account is connected", async () => {
  const {html} = await render("/sites/example.test/settings?tab=integrations", {
    ...fixture,
    data: {
      ...fixture.data,
      googleOAuth: {...fixture.data.googleOAuth, configured: true, hasSecret: true},
      googleAuthUrl: "/api/auth/google?site=example.test",
    },
  })
  expect(html).toContain("待授权")
  expect(html).toContain('href="/api/auth/google?site=example.test"')
  expect(html).toContain("连接 Google</a>")
  expect(html).not.toContain("保存资源")
})
