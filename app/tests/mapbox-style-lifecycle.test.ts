import { expect, test } from "bun:test"
import type { Map as MapboxMap } from "mapbox-gl"
import { createMapboxStyleLifecycle } from "../src/lib/mapbox-style-lifecycle"
import { DEFAULT_MAPBOX_STYLE, MAPBOX_STYLES, getMapboxStyle, mapboxStyleConfig, normalizeMapboxStyle } from "../src/lib/mapbox-styles"

function fixture() {
  const listeners = new Map<string, Set<(event: any) => void>>()
  const requests: Array<{url: string; options: any}> = []
  const map = {
    on(type: string, callback: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(callback)
      return map
    },
    off(type: string, callback: (event: any) => void) {listeners.get(type)?.delete(callback); return map},
    setStyle(url: string, options: any) {requests.push({url, options}); return map},
  }
  return {
    map: map as unknown as Pick<MapboxMap, "on" | "off" | "setStyle">,
    requests, listeners,
    emit(type: string, event = {}) {for (const callback of listeners.get(type) || []) callback(event)},
  }
}

test("Mapbox preferences select exactly Standard, Streets and Dark and cannot supply a URL", () => {
  expect(MAPBOX_STYLES.map(style => style.id)).toEqual(["standard", "streets-v12", "dark-v11"])
  expect(new Set(MAPBOX_STYLES.map(style => style.id)).size).toBe(3)
  expect(MAPBOX_STYLES.filter(style => style.standard).map(style => style.id)).toEqual(["standard"])
  for (const style of MAPBOX_STYLES) {
    expect(normalizeMapboxStyle(style.id)).toBe(style.id)
    expect(getMapboxStyle(style.id).url).toBe(`mapbox://styles/mapbox/${style.id}`)
  }
  for (const invalid of [null, undefined, "", "__proto__", "constructor", "https://example.com/style.json", "mapbox://styles/other/private", "standard?access_token=secret", {id: "dark-v11"}]) {
    expect(normalizeMapboxStyle(invalid)).toBe(DEFAULT_MAPBOX_STYLE)
  }
})

test("removed map styles safely resolve to Standard without retaining their old map URLs", () => {
  for (const removed of ["standard-satellite", "satellite-streets-v12", "satellite-v9", "light-v11", "outdoors-v12", "navigation-day-v1", "navigation-night-v1"]) {
    expect(normalizeMapboxStyle(removed)).toBe(DEFAULT_MAPBOX_STYLE)
    expect(getMapboxStyle(removed).url).toBe("mapbox://styles/mapbox/standard")
  }
})

test("Standard follows interface appearance while Streets and Dark keep their own basemap colors", () => {
  for (const style of MAPBOX_STYLES) {
    if (style.standard) {
      expect(mapboxStyleConfig(style.id, false)?.basemap.lightPreset).toBe("day")
      expect(mapboxStyleConfig(style.id, true)?.basemap.lightPreset).toBe("night")
    } else {
      expect(mapboxStyleConfig(style.id, false)).toBeUndefined()
      expect(mapboxStyleConfig(style.id, true)).toBeUndefined()
    }
  }
  expect(mapboxStyleConfig("standard", true)?.basemap).toMatchObject({theme: "monochrome", show3dObjects: false})
})

test("basemap changes restore application overlays once per load, without accumulating event listeners", () => {
  const f = fixture()
  const restored: string[] = []
  let loading = 0, failures = 0, dark = false
  const lifecycle = createMapboxStyleLifecycle(f.map, {
    initialStyleId: "standard", isDark: () => dark,
    onReady: style => {restored.push(style.id)}, onLoading: () => loading++, onFailure: () => failures++,
  })
  f.emit("style.load")
  lifecycle.setStyle("standard")
  expect(f.requests).toHaveLength(0)
  for (const style of MAPBOX_STYLES.slice(1)) {
    lifecycle.setStyle(style.id)
    f.emit("style.load")
    expect(f.listeners.get("style.load")?.size).toBe(1)
    expect(f.listeners.get("error")?.size).toBe(1)
    expect(f.requests.at(-1)?.url).toBe(style.url)
    expect(f.requests.at(-1)?.options.diff).toBe(false)
    if (!style.standard) expect(f.requests.at(-1)?.options.config).toBeUndefined()
  }
  dark = true
  lifecycle.setStyle("standard")
  f.emit("style.load")
  expect(f.requests.at(-1)?.options.config.basemap.lightPreset).toBe("night")
  expect(restored).toEqual([...MAPBOX_STYLES.map(style => style.id), "standard"])
  expect(loading).toBe(3)
  expect(failures).toBe(0)
  lifecycle.dispose()
  for (const listeners of f.listeners.values()) expect(listeners.size).toBe(0)
})

test("rapid style changes ignore late authorization errors for abandoned styles but preserve real failures", () => {
  const f = fixture()
  const restored: string[] = []
  let failures = 0
  const lifecycle = createMapboxStyleLifecycle(f.map, {
    initialStyleId: "standard", isDark: () => false,
    onReady: style => {restored.push(style.id)}, onLoading() {}, onFailure: () => failures++,
  })
  lifecycle.setStyle("streets-v12")
  lifecycle.setStyle("dark-v11")
  f.emit("error", {error: {status: 403, url: "https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=fixture"}})
  f.emit("error", {error: {status: 401, message: "request failed: mapbox://styles/mapbox/standard"}})
  f.emit("error", {error: {status: 503, url: "https://api.mapbox.com/styles/v1/mapbox/dark-v11"}})
  expect(failures).toBe(0)
  f.emit("style.load")
  expect(restored).toEqual(["dark-v11"])
  f.emit("error", {error: {status: 403, url: "https://api.mapbox.com/styles/v1/mapbox/dark-v11"}})
  f.emit("webglcontextlost")
  expect(failures).toBe(1)
  lifecycle.dispose()
})

test("global token failures and WebGL loss still trigger fallback without waiting for the loading timeout", () => {
  for (const failure of ["session", "token", "webgl"]) {
    const f = fixture()
    let failures = 0
    const lifecycle = createMapboxStyleLifecycle(f.map, {
      initialStyleId: "streets-v12", isDark: () => true,
      onReady() {}, onLoading() {}, onFailure: () => failures++,
    })
    if (failure === "session") f.emit("error", {error: {status: 401, url: "https://api.mapbox.com/map-sessions/v1?access_token=fixture"}})
    else if (failure === "token") f.emit("error", {error: {message: "A valid Mapbox access token is required"}})
    else f.emit("webglcontextlost")
    expect(failures).toBe(1)
    lifecycle.dispose()
  }
})

test("a successful style load clears its timeout, and disposal cancels pending callbacks", async () => {
  const f = fixture()
  let ready = 0, failures = 0
  const lifecycle = createMapboxStyleLifecycle(f.map, {
    initialStyleId: "standard", isDark: () => false, timeoutMs: 10,
    onReady: () => ready++, onLoading() {}, onFailure: () => failures++,
  })
  f.emit("style.load")
  await Bun.sleep(20)
  expect(failures).toBe(0)
  lifecycle.setStyle("dark-v11")
  lifecycle.dispose()
  f.emit("style.load")
  f.emit("error", {error: {status: 403}})
  await Bun.sleep(20)
  expect(ready).toBe(1)
  expect(failures).toBe(0)
})

test("a stalled current style falls back once; overlay restoration errors also fall back safely", async () => {
  const f = fixture()
  let failures = 0
  const lifecycle = createMapboxStyleLifecycle(f.map, {
    initialStyleId: "standard", isDark: () => false, timeoutMs: 5,
    onReady() {}, onLoading() {}, onFailure: () => failures++,
  })
  lifecycle.setStyle("streets-v12")
  await Bun.sleep(15)
  expect(failures).toBe(1)
  f.emit("error", {error: {status: 401}})
  expect(failures).toBe(1)
  lifecycle.dispose()
  const f2 = fixture()
  const lifecycle2 = createMapboxStyleLifecycle(f2.map, {
    initialStyleId: "standard", isDark: () => false,
    onReady() {throw new Error("local overlay failed")}, onLoading() {}, onFailure: () => failures++,
  })
  f2.emit("style.load")
  expect(failures).toBe(2)
  lifecycle2.dispose()
})
