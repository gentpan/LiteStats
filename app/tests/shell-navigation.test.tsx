import { expect, test } from "bun:test"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { Shell } from "../src/components/Shell"
import { I18nProvider } from "../src/lib/i18n"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return {promise, resolve}
}

test("pending navigation preserves the visible page's shell in both directions", async () => {
  const statsStarted = deferred()
  const statsFinished = deferred()
  const homeStarted = deferred()
  const homeFinished = deferred()
  let returningHome = false
  const root = createRootRoute({component: () => <I18nProvider locale="zh-CN"><Outlet /></I18nProvider>})
  const home = createRoute({getParentRoute: () => root, path: "/dashboard", loader: async () => {
    if (returningHome) {
      homeStarted.resolve()
      await homeFinished.promise
    }
  }, component: () => <Shell><h1>Site list</h1></Shell>})
  const stats = createRoute({getParentRoute: () => root, path: "/sites/$domain", loader: async () => {
    statsStarted.resolve()
    await statsFinished.promise
  }, component: () => <Shell layout="analytics"><h1>Statistics</h1></Shell>})
  const router = createRouter({routeTree: root.addChildren([home, stats]), history: createMemoryHistory({initialEntries: ["/dashboard"]}), isServer: false, origin: "https://local.test", defaultStaleTime: 0, defaultStaleReloadMode: "blocking"})
  // Exercise client loading, but snapshot its current match tree without mounting
  // the DOM transition acknowledgements that a static renderer cannot run.
  const snapshot = () => {
    router.isServer = true
    try { return renderToString(<RouterProvider router={router} />) }
    finally { router.isServer = false }
  }
  await router.load()
  const before = snapshot()
  expect(before).toContain("management-shell")
  expect(before).toContain("Site list")

  const navigation = router.navigate({to: "/sites/$domain", params: {domain: "example.com"}})
  try {
    await statsStarted.promise
    expect(router.state.location.pathname).toBe("/sites/example.com")
    expect(router.state.matches.at(-1)?.routeId).toBe(home.id)
    const pending = snapshot()
    expect(pending).toContain("Site list")
    expect(pending).toContain("management-shell")
  } finally {
    statsFinished.resolve()
    await navigation
  }
  expect(snapshot()).toContain("Statistics")
  expect(snapshot()).not.toContain("management-shell")

  returningHome = true
  const returnNavigation = router.navigate({to: "/dashboard"})
  try {
    await homeStarted.promise
    expect(router.state.location.pathname).toBe("/dashboard")
    expect(router.state.matches.at(-1)?.routeId).toBe(stats.id)
    const pending = snapshot()
    expect(pending).toContain("Statistics")
    expect(pending).not.toContain("management-shell")
  } finally {
    homeFinished.resolve()
    await returnNavigation
  }
  expect(snapshot()).toContain("Site list")
  expect(snapshot()).toContain("management-shell")
})
