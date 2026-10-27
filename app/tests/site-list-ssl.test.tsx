import { expect, spyOn, test } from "bun:test"
import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router"
import { CompactMetrics, Route } from "../src/routes/dashboard"
import * as actions from "../src/lib/actions"

test("site cards show the SSL certificate remaining days", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue({id: 7, name: "Owner", email: "owner@example.com"} as Awaited<ReturnType<typeof actions.meFn>>)
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([{
    id: 1, domain: "example.com", name: "Example", timezone: "UTC", team_id: 1, public: false, allowed_event_props: null,
    certificateExpiresAt: "2099-01-01T00:00:00.000Z", visitors: 12, visits: 14, pageviews: 20, live: 0, change: 0, sparkline: [],
  }])
  try {
    const router = createRouter({routeTree: Route, history: createMemoryHistory({initialEntries: ["/dashboard"]})})
    await router.load()
    const html = renderToString(<RouterProvider router={router} />)
    expect(html).toContain("management-site-ssl")
    expect(html).toMatch(/SSL .*天/)
    expect(html).not.toContain("is-expiring")
    expect(html).not.toContain('<p title="example.com"')
  } finally {
    me.mockRestore()
    sites.mockRestore()
  }
})

test("SSL certificates with fewer than 30 days use the warning badge", async () => {
  const me = spyOn(actions, "meFn").mockResolvedValue({id: 7, name: "Owner", email: "owner@example.com"} as Awaited<ReturnType<typeof actions.meFn>>)
  const certificateExpiresAt = new Date(Date.now() + 15 * 86400000).toISOString()
  const sites = spyOn(actions, "sitesFn").mockResolvedValue([{
    id: 1, domain: "example.com", name: "Example", timezone: "UTC", team_id: 1, public: false, allowed_event_props: null,
    certificateExpiresAt, visitors: 12, visits: 14, pageviews: 20, live: 0, change: 0, sparkline: [],
  }])
  try {
    const router = createRouter({routeTree: Route, history: createMemoryHistory({initialEntries: ["/dashboard"]})})
    await router.load()
    const html = renderToString(<RouterProvider router={router} />)
    expect(html).toContain("management-site-ssl is-expiring")
  } finally {
    me.mockRestore()
    sites.mockRestore()
  }
})

test("compact layout exposes visits, pageviews and online visitors", () => {
  const html = renderToStaticMarkup(<CompactMetrics site={{
    id: 1, domain: "example.com", name: "Example", timezone: "UTC", team_id: 1, public: false, allowed_event_props: null,
    certificateExpiresAt: null, visitors: 12, visits: 14, pageviews: 20, live: 3, change: 0, sparkline: [],
  }} />)
  expect(html).toContain("management-compact-spark")
  expect(html).toContain("<svg")
  expect(html).toContain('preserveAspectRatio="none"')
  expect(html).toContain("is-online")
  for (const text of ["访客", "访问次数", "浏览量", "当前在线"]) expect(html).toContain(text)
  for (const value of ["12", "14", "20", "3"]) expect(html).toContain(`<strong>${value}</strong>`)
})
