import { expect, spyOn, test } from "bun:test"
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import * as actions from "../src/lib/actions"
import { rootAppearancePreferences } from "../src/lib/theme-appearance"
import { Route as layout } from "../src/routes/sites/$domain"
import { Route as index } from "../src/routes/sites/$domain.index"

test("direct child-page entry then returning to statistics loads analytics for the requested site and range", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue(null)
  const calls: unknown[] = []
  const dashboard = spyOn(actions, "dashboardFn").mockImplementation((async input => {
    calls.push(input?.data)
    return {site: {public: true}, marker: calls.length} as unknown as Awaited<ReturnType<typeof actions.dashboardFn>>
  }) as typeof actions.dashboardFn)
  try {
    for (const child of ["health", "settings", "activity"]) {
      const root = createRootRoute({loader: async () => ({...rootAppearancePreferences(null, "zh-CN"), mapboxStyle: "standard" as import("../src/lib/mapbox-styles").MapboxStyleId})})
      const parent = createRoute({...layout.options, getParentRoute: () => root, path: "/sites/$domain"})
      const stats = createRoute({...index.options, getParentRoute: () => parent, path: "/"})
      const detail = createRoute({getParentRoute: () => parent, path: child, loader: () => ({child})})
      const router = createRouter({routeTree: root.addChildren([parent.addChildren([stats, detail])]), history: createMemoryHistory({initialEntries: [`/sites/example.com/${child}`]})})
      const before = calls.length
      await router.load()
      expect(calls).toHaveLength(before)
      await router.navigate({to: "/sites/$domain", params: {domain: "example.com"}, search: {period: "7d"}})
      expect(router.state.matches.at(-1)?.routeId).toBe(stats.id)
      expect(router.state.matches.at(-1)?.status).toBe("success")
      expect(router.state.matches.at(-1)?.loaderData).toMatchObject({data: {marker: before + 1}})
      expect(calls.at(-1)).toMatchObject({domain: "example.com", period: "7d"})
      await router.navigate({to: "/sites/$domain", params: {domain: "other.example.com"}, search: {period: "28d"}})
      expect(calls.at(-1)).toMatchObject({domain: "other.example.com", period: "28d"})
      expect(router.state.matches.at(-1)?.loaderData).toMatchObject({data: {marker: before + 2}})
    }
  } finally {me.mockRestore(); dashboard.mockRestore()}
})
