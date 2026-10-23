import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { MapCard } from "../src/components/WorldMap"
import { MapboxVisitorMap } from "../src/components/MapboxVisitorMap"
import { readMapFlags, saveMapFlags } from "../src/lib/map-flags-preference"

function withStorage(storage: unknown, run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  try {
    Object.defineProperty(globalThis, "localStorage", {configurable: true, value: storage})
    run()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor)
    else Reflect.deleteProperty(globalThis, "localStorage")
  }
}

test("map flags default to visible and restore only an explicit hidden preference", () => {
  for (const [value, visible] of [[null, true], ["visible", true], ["hidden", false], ["false", true], ["__proto__", true]] as const) {
    withStorage({getItem: (key: string) => {
      expect(key).toBe("litestats:map-flags")
      return value
    }}, () => { expect(readMapFlags()).toBe(visible) })
  }
  withStorage(undefined, () => { expect(readMapFlags()).toBe(true) })
  withStorage({getItem: () => {throw new Error("Blocked")}}, () => { expect(readMapFlags()).toBe(true) })
})

test("map flags save independently and blocked storage cannot break switching", () => {
  const saved: Array<[string, string]> = []
  withStorage({setItem: (key: string, value: string) => saved.push([key, value])}, () => {
    saveMapFlags(false)
    saveMapFlags(true)
  })
  expect(saved).toEqual([["litestats:map-flags", "hidden"], ["litestats:map-flags", "visible"]])
  withStorage(undefined, () => { expect(() => saveMapFlags(false)).not.toThrow() })
  withStorage({setItem: () => {throw new Error("Blocked")}}, () => { expect(() => saveMapFlags(true)).not.toThrow() })
})

test("both map engines retain the flag switch beside the title and live count", () => {
  for (const mapboxToken of ["", "pk.fixture-only"]) {
    const html = renderToString(<MapCard mapboxToken={mapboxToken} rows={[{name: "CN", value: 23}]} live={[{country: "CN"}]} liveCount={7}/>)
    expect(html).toContain('type="checkbox" role="switch" checked=""')
    expect(html.indexOf("当前访客")).toBeLessThan(html.indexOf("国旗"))
    expect(html).toContain('class="map-live-count')
    expect(html).toContain("7")
    expect(html).toContain('data-show-flags="true"')
    expect(html).toContain('aria-label="放大"')
    expect(html).toContain('aria-label="缩小"')
    expect(html).toContain("重置")
  }
})

test("Mapbox flag visibility is a visual preference without replacing the map viewport", () => {
  for (const showFlags of [false, true]) {
    const html = renderToString(<MapboxVisitorMap token="pk.fixture-only" rows={[]} live={[]} showFlags={showFlags} onFailure={() => {}}/>)
    expect(html).toContain(`data-show-flags="${showFlags}"`)
    expect(html).toContain('class="mapbox-viewport"')
    expect(html).toContain('aria-label="访客分布"')
  }
})
