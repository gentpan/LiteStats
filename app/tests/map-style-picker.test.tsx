import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { MapStylePicker } from "../src/components/MapStylePicker"
import { MapStyleProvider } from "../src/lib/map-preferences"
import { I18nProvider } from "../src/lib/i18n"
import { MAPBOX_STYLES, type MapboxStyleId } from "../src/lib/mapbox-styles"

async function renderPicker(styleId: MapboxStyleId, locale: "en" | "zh-CN" = "zh-CN") {
  const root = createRootRoute({component: () => <I18nProvider locale={locale}><MapStyleProvider styleId={styleId}><MapStylePicker/></MapStyleProvider></I18nProvider>})
  const router = createRouter({routeTree: root, history: createMemoryHistory({initialEntries: ["/"]}), isServer: true})
  await router.load()
  return renderToString(<RouterProvider router={router}/>)
}

test("personal map picker exposes only three named previews and exactly the current account's saved choice", async () => {
  for (const selected of ["standard", "streets-v12", "dark-v11"] as const) {
    const html = await renderPicker(selected)
    const inputs = html.match(/<input[^>]*>/g) || []
    expect(inputs).toHaveLength(3)
    expect(inputs.filter(input => input.includes('checked=""'))).toHaveLength(1)
    expect(inputs.find(input => input.includes('checked=""'))).toContain(`value="${selected}"`)
    for (const style of MAPBOX_STYLES) {
      expect(html).toContain(`/map-previews/${style.id}.webp`)
      expect(html).toContain(style.label)
    }
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain("access_token")
    expect(html).not.toContain("mapbox://")
    for (const removed of ["standard-satellite", "satellite-streets-v12", "satellite-v9", "light-v11", "outdoors-v12", "navigation-day-v1", "navigation-night-v1"]) {
      expect(html).not.toContain(removed)
    }
  }
})

test("map preferences remain readable in English and describe account-scoped persistence", async () => {
  const html = await renderPicker("dark-v11", "en")
  expect(html).toContain("Map style")
  expect(html).toContain("Your choice is saved to your account")
  expect(html).toContain('alt="Dark map preview"')
  expect(html).not.toContain("选择后自动保存")
})
