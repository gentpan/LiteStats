import { expect, spyOn, test } from "bun:test"
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import * as actions from "../src/lib/actions"
import { rootAppearancePreferences } from "../src/lib/theme-appearance"
import { Route as LoginRoute } from "../src/routes/login"
import { Route as RegisterRoute } from "../src/routes/register"
import { Route as DashboardRoute } from "../src/routes/dashboard"
import { Route as HomeRoute } from "../src/routes/index"

function routerAt(path: string) {
  const root = createRootRoute({loader: async () => ({...rootAppearancePreferences(null, "zh-CN"), mapboxStyle: "standard" as import("../src/lib/mapbox-styles").MapboxStyleId})})
  const home = createRoute({...HomeRoute.options, getParentRoute: () => root, path: "/"})
  const login = createRoute({...LoginRoute.options, getParentRoute: () => root, path: "/login"})
  const register = createRoute({...RegisterRoute.options, getParentRoute: () => root, path: "/register"})
  const sites = createRoute({...DashboardRoute.options, getParentRoute: () => root, path: "/dashboard"})
  return createRouter({routeTree: root.addChildren([home, login, register, sites]), history: createMemoryHistory({initialEntries: [path]}), isServer: false, origin: "https://local.test"})
}

test("anonymous homepage entries stay public and do not load private site analytics", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  const dashboard = spyOn(actions, "dashboardFn")
  const traffic = spyOn(actions, "trafficPulseFn")
  try {
    for (const path of ["/", "/?gsc=private-provider-message"]) {
      const router = routerAt(path)
      await router.load()
      expect(router.state.location.pathname).toBe("/")
      expect(router.state.matches.at(-1)?.routeId).toBe("/")
      expect(router.state.matches.at(-1)?.status).toBe("success")
      expect(router.state.matches.at(-1)?.search).toMatchObject({gsc: undefined})
    }
    expect(sites).not.toHaveBeenCalled()
    expect(dashboard).not.toHaveBeenCalled()
    expect(traffic).not.toHaveBeenCalled()
  } finally {me.mockRestore(); sites.mockRestore(); dashboard.mockRestore(); traffic.mockRestore()}
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

test("signed-in login and registration entries open the authenticated site list", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue({id: 7} as Awaited<ReturnType<typeof actions.meFn>>)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    for (const path of ["/login", "/register"]) {
      const router = routerAt(path)
      await router.load()
      expect(router.state.location.pathname).toBe("/dashboard")
      expect(router.state.matches.at(-1)?.status).toBe("success")
      expect(router.state.matches.at(-1)?.loaderData).toMatchObject({me: {id: 7}, sites: []})
    }
    expect(sites).toHaveBeenCalledTimes(2)
  } finally {me.mockRestore(); sites.mockRestore()}
})

test("the public homepage separation does not expose the site list to signed-out visitors", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([])
  try {
    const router = routerAt("/dashboard")
    await router.load()
    expect(router.state.location.pathname).toBe("/login")
    expect(router.state.matches.at(-1)?.status).toBe("success")
    expect(sites).not.toHaveBeenCalled()
    for (const path of ["/login", "/register"]) {
      const publicAuth = routerAt(path)
      await publicAuth.load()
      expect(publicAuth.state.location.pathname).toBe(path)
      expect(publicAuth.state.matches.at(-1)?.status).toBe("success")
    }
  } finally {me.mockRestore(); sites.mockRestore()}
})
