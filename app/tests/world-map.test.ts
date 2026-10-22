import { expect, test, mock } from "bun:test"
import { readFile } from "node:fs/promises"
import { feature } from "topojson-client"
import { geoCentroid, geoMercator, geoPath } from "d3"
import world from "visionscarto-world-atlas/world/50m.json"
import { packWorldMap } from "../scripts/prepare-world-map"
import { decodeWorldMap, type WorldTopology } from "../src/lib/world-map-format"
import { loadWorldMap } from "../src/lib/world-countries"

const source = world as unknown as WorldTopology
const bytes = new Uint8Array(await readFile(new URL("../src/assets/world-50m.bin", import.meta.url)))
const buffer = () => bytes.slice().buffer

test("packed atlas is reproducible and preserves all 242 countries, coordinates, projected paths and centroids", () => {
  expect(bytes).toEqual(packWorldMap(source))
  const decoded = decodeWorldMap(buffer())
  expect(decoded.arcs).toEqual(source.arcs)
  expect(decoded.transform).toEqual(source.transform)
  const before = feature(source, source.objects.countries).features
  const after = feature(decoded, decoded.objects.countries).features
  expect(after).toHaveLength(242)
  const projection = geoMercator().rotate([-150, 0]).scale(960 * 0.158).translate([480, 280])
  const path = geoPath().projection(projection)
  for (let i = 0; i < before.length; i++) {
    expect(after[i].id).toBe(before[i].id)
    expect(after[i].properties?.a3).toBe(before[i].properties?.a3)
    expect(after[i].geometry).toEqual(before[i].geometry)
    expect(geoCentroid(after[i])).toEqual(geoCentroid(before[i]))
    expect(path(after[i])).toBe(path(before[i]))
  }
})

test("map decoder rejects wrong versions, truncated, overflowing and trailing data", () => {
  expect(() => decodeWorldMap(new ArrayBuffer(0))).toThrow()
  const wrongVersion = bytes.slice(); wrongVersion[3] = 50
  expect(() => decodeWorldMap(wrongVersion.buffer)).toThrow()
  for (const end of [7, 100, bytes.length - 1]) {
    expect(() => decodeWorldMap(bytes.slice(0, end).buffer)).toThrow()
  }
  const overflowing = bytes.slice()
  const offset = 8 + new DataView(overflowing.buffer).getUint32(4, true)
  overflowing.fill(255, offset, offset + 6)
  expect(() => decodeWorldMap(overflowing.buffer)).toThrow()
  const trailing = new Uint8Array(bytes.length + 1); trailing.set(bytes)
  expect(() => decodeWorldMap(trailing.buffer)).toThrow()
})

test("map loading retries HTTP and decoding failures, deduplicates concurrent requests and caches decoded features", async () => {
  const original = globalThis.fetch
  try {
    const failed = mock(async () => new Response("Unavailable", { status: 503 }))
    globalThis.fetch = Object.assign(failed, { preconnect: original.preconnect })
    await expect(loadWorldMap()).rejects.toThrow("Unable to load world map")
    expect(failed).toHaveBeenCalledTimes(1)
    globalThis.fetch = Object.assign(mock(async () => new Response("Not a map")), { preconnect: original.preconnect })
    await expect(loadWorldMap()).rejects.toThrow()
    let resolve!: (response: Response) => void
    const success = mock(() => new Promise<Response>((done) => { resolve = done }))
    globalThis.fetch = Object.assign(success, { preconnect: original.preconnect })
    const first = loadWorldMap(), concurrent = loadWorldMap()
    expect(first).toBe(concurrent)
    resolve(new Response(buffer()))
    const features = await first
    expect(features).toHaveLength(242)
    expect(await loadWorldMap()).toBe(features)
    expect(success).toHaveBeenCalledTimes(1)
  } finally {
    globalThis.fetch = original
  }
})
