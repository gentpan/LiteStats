import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import * as authActions from "../src/lib/auth-actions"
import * as actions from "../src/lib/actions"
import * as userActions from "../src/lib/user-actions"
import { rootAppearancePreferences } from "../src/lib/theme-appearance"
import { Route as LoginRoute } from "../src/routes/login"
import { Route as RegisterRoute } from "../src/routes/register"
import { Route as DashboardRoute } from "../src/routes/dashboard"
import { Route as HomeRoute } from "../src/routes/index"
import { Route as SetupRoute } from "../src/routes/setup"

let instanceSetup: ReturnType<typeof spyOn<typeof actions, "instanceSetupFn">>
let capabilities: ReturnType<typeof spyOn<typeof authActions, "loginCapabilitiesFn">>
let registration: ReturnType<typeof spyOn<typeof userActions, "registrationStatusFn">>
beforeEach(() => {capabilities = spyOn(authActions, "loginCapabilitiesFn").mockResolvedValue({passkeyEnabled: false}); instanceSetup = spyOn(actions, "instanceSetupFn").mockResolvedValue({needsSetup: false}); registration = spyOn(userActions, "registrationStatusFn").mockResolvedValue({enabled: false})})
afterEach(() => {instanceSetup.mockRestore(); capabilities.mockRestore(); registration.mockRestore()})

function routerAt(path: string) {
  const root = createRootRoute({loader: async () => ({...rootAppearancePreferences(null, "zh-CN"), mapboxStyle: "standard" as import("../src/lib/mapbox-styles").MapboxStyleId})})
  const home = createRoute({...HomeRoute.options, getParentRoute: () => root, path: "/"})
  const login = createRoute({...LoginRoute.options, getParentRoute: () => root, path: "/login"})
  const register = createRoute({...RegisterRoute.options, getParentRoute: () => root, path: "/register"})
  const setup = createRoute({...SetupRoute.options, getParentRoute: () => root, path: "/setup"})
  const sites = createRoute({...DashboardRoute.options, getParentRoute: () => root, path: "/dashboard"})
  return createRouter({routeTree: root.addChildren([home, login, register, setup, sites]), history: createMemoryHistory({initialEntries: [path]}), isServer: false, origin: "https://local.test"})
}

test("empty instances send root, login and legacy registration entries to one-time administrator setup", async () => {
  instanceSetup.mockResolvedValue({needsSetup: true})
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    for (const path of ["/", "/login", "/register"]) {
      const router = routerAt(path)
      await router.load()
      expect(router.state.location.pathname).toBe("/setup")
      expect(router.state.matches.at(-1)?.status).toBe("success")
    }
    expect(sites).not.toHaveBeenCalled()
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("setup shows the sole administrator form without creating an account on page load", async () => {
  instanceSetup.mockResolvedValue({needsSetup: true})
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const createAdmin = spyOn(actions, "setupAdminFn").mockRejectedValue(new Error("Unexpected account creation"))
  try {
    const router = routerAt("/setup")
    await router.load()
    const html = renderToString(createElement(RouterProvider, {router}))
    expect(html).toContain("创建管理员")
    expect(html).toContain("完成后将关闭公开注册")
    expect(html).toContain('name="email"')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('minLength="8"')
    expect(html.match(/<form/g)).toHaveLength(1)
    expect(html).not.toContain('href="/register"')
    expect(createAdmin).not.toHaveBeenCalled()
  } finally {me.mockRestore(); createAdmin.mockRestore()}
})

test("initialized instances close setup and show registration as unavailable", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    const setup = routerAt("/setup")
    await setup.load()
    expect(setup.state.location.pathname).toBe("/login")
    expect(setup.state.matches.at(-1)?.status).toBe("success")
    const register = routerAt("/register")
    await register.load()
    expect(register.state.location.pathname).toBe("/register")
    expect(register.state.matches.at(-1)?.status).toBe("success")
    expect(renderToString(createElement(RouterProvider, {router: register}))).toContain("当前未开放注册")
    expect(sites).not.toHaveBeenCalled()
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("open registration renders the account form and login link", async () => {
  registration.mockResolvedValue({enabled: true})
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    const register = routerAt("/register")
    await register.load()
    const html = renderToString(createElement(RouterProvider, {router: register}))
    expect(html).toContain("创建账号")
    expect(html).toContain('type="email"')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('href="/login"')
    expect(sites).not.toHaveBeenCalled()
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("anonymous root entries open login without loading private site analytics or forwarding unknown query values", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  const dashboard = spyOn(actions, "dashboardFn")
  const traffic = spyOn(actions, "trafficPulseFn")
  try {
    for (const path of ["/", "/?gsc=private-provider-message", "/?gsc=expired&error_description=private-provider-message"]) {
      const router = routerAt(path)
      await router.load()
      expect(router.state.location.pathname).toBe("/login")
      expect(router.state.location.searchStr).toBe("")
      expect(router.state.matches.at(-1)?.routeId).toBe("/login")
      expect(router.state.matches.at(-1)?.status).toBe("success")
    }
    expect(sites).not.toHaveBeenCalled()
    expect(dashboard).not.toHaveBeenCalled()
    expect(traffic).not.toHaveBeenCalled()
  } finally {me.mockRestore(); sites.mockRestore(); dashboard.mockRestore(); traffic.mockRestore()}
})

test("signed-in root entries open the authenticated site list and discard unknown query values", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue({id: 7} as Awaited<ReturnType<typeof actions.meFn>>)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    for (const path of ["/", "/?gsc=private-provider-message&error_description=private-provider-message"]) {
      const router = routerAt(path)
      await router.load()
      expect(router.state.location.pathname).toBe("/dashboard")
      expect(router.state.location.searchStr).toBe("")
      expect(router.state.matches.at(-1)?.status).toBe("success")
      expect(router.state.matches.at(-1)?.loaderData).toMatchObject({me: {id: 7}, sites: []})
    }
    expect(sites).toHaveBeenCalledTimes(2)
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("the previous OAuth recovery entry reaches the site list with a bounded failure code", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue({id: 7} as Awaited<ReturnType<typeof actions.meFn>>)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    const router = routerAt("/?gsc=expired&error_description=private-provider-message")
    await router.load()
    expect(router.state.location.pathname).toBe("/dashboard")
    expect(router.state.location.searchStr).toBe("?gsc=expired")
    expect(router.state.matches.at(-1)?.status).toBe("success")
    expect(router.state.matches.at(-1)?.search).toMatchObject({gsc: "expired"})
    expect(sites).toHaveBeenCalledTimes(1)
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("signed-in login, setup and legacy registration entries open the authenticated site list", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue({id: 7} as Awaited<ReturnType<typeof actions.meFn>>)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    for (const path of ["/login", "/setup", "/register"]) {
      const router = routerAt(path)
      await router.load()
      expect(router.state.location.pathname).toBe("/dashboard")
      expect(router.state.matches.at(-1)?.status).toBe("success")
      expect(router.state.matches.at(-1)?.loaderData).toMatchObject({me: {id: 7}, sites: []})
    }
    expect(sites).toHaveBeenCalledTimes(3)
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("signed-out visitors cannot access the site list and can open login without a registration link", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    const router = routerAt("/dashboard")
    await router.load()
    expect(router.state.location.pathname).toBe("/login")
    expect(router.state.matches.at(-1)?.status).toBe("success")
    expect(sites).not.toHaveBeenCalled()
    const html = renderToString(createElement(RouterProvider, {router}))
    expect(html).not.toContain('href="/register"')
  } finally {me.mockRestore(); sites.mockRestore()}
})


test("Passkey login appears only when a credential is configured", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  try {
    for (const enabled of [false, true, false]) {
      capabilities.mockResolvedValue({passkeyEnabled: enabled})
      const router = routerAt("/login")
      await router.load()
      const html = renderToString(createElement(RouterProvider, {router}))
      expect(html.includes("使用 Passkey 登录")).toBe(enabled)
      expect(html).toContain('type="password"')
      expect(html).toContain('aria-label="GitHub"')
      expect(html).toContain("fa-github")
    }
  } finally {me.mockRestore()}
})
