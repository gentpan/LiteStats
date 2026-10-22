import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { mapboxSettingsSchema, mapboxTokenSchema } from "../src/lib/mapbox-validation"
import { mapboxVisitorData } from "../src/lib/mapbox-data"
import { MapboxSettingsPanel } from "../src/components/MapboxSettingsPanel"
import type { WorldJsonCountryData } from "../src/lib/world-countries"

test("Mapbox configuration rejects secret tokens and distinguishes keeping a key from clearing it", () => {
  expect(mapboxTokenSchema.parse(" pk.fixture.signature ")).toBe("pk.fixture.signature")
  for (const token of ["sk.fixture.signature", "pk.", "https://example.com/pk.foo", "pk.a.b\nextra", "pk.a." + "b".repeat(2048)]) {
    expect(mapboxTokenSchema.safeParse(token).success).toBe(false)
  }
  expect(mapboxSettingsSchema.parse({enabled: false}).token).toBeUndefined()
  expect(mapboxSettingsSchema.parse({enabled: false, token: ""}).token).toBe("")
})

test("Mapbox country overlays retain counts, country filtering keys and live-only countries", () => {
  const features: WorldJsonCountryData[] = ["CHN", "USA", "GBR"].map(a3 => ({type: "Feature", properties: {a3}, geometry: {
    type: "Polygon", coordinates: [[[100, 20], [100, 30], [110, 30], [110, 20], [100, 20]]],
  }}))
  const data = mapboxVisitorData(features, [
    {name: "cn\0", value: 4, label: "中国"}, {name: "CN", value: 5, label: "中国"},
    {name: "US", value: 1}, {name: "(none)", value: 100}, {name: "ZZ", value: 100},
    {name: "GB", value: -1}, {name: "GB", value: NaN},
  ], [{country: "CN"}, {country: "cn"}, {country: "GB"}, {country: "ZZ"}])
  expect(data.countries.map(country => [country.code, country.visitors, country.live])).toEqual([["CN", 9, 2], ["US", 1, 0], ["GB", 0, 1]])
  expect(data.countries[0].weight).toBe(1)
  expect(data.countries[1].weight).toBeCloseTo(1 / 3)
  expect(data.countries.every(country => country.center.every(Number.isFinite))).toBe(true)
  expect(data.polygons.features.map(feature => feature.id)).toEqual(["CN", "US", "GB"])
  expect(mapboxVisitorData(features, [], []).polygons.features).toHaveLength(0)
})

test("Mapbox settings never refill the saved token into the form", () => {
  const html = renderToStaticMarkup(<MapboxSettingsPanel initial={{enabled: true, configured: true}}/>)
  expect(html).toContain('type="password"')
  expect(html).toContain('value=""')
  expect(html).toContain("已保存密钥，留空保留")
  expect(html).toContain("sk. 私密密钥")
})
