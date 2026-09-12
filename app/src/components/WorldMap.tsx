import { useEffect, useMemo, useRef, useState } from "react"
import * as d3 from "d3"
import { CountryFlag } from "~/components/icons"
import { TrafficHeatmap, type HeatCell } from "~/components/TrafficHeatmap"
import { countryName } from "~/lib/countries"
import { numberShort } from "~/lib/format"
import {
  COUNTRIES_BY_TWO_LETTER_CODE,
  parseWorldTopoJsonToGeoJsonFeatures,
  type WorldJsonCountryData,
} from "~/lib/world-countries"

const MAP_ROTATE: [number, number] = [-160, 0]
const WIDE_WIDTH = 960
const WIDE_HEIGHT = 420
const OCEAN = "#eef3f8"
const EMPTY_FILL = "#d5dde7"
const BORDER = "#f8fafc"
const COLOR_STOPS = ["#c7d2fe", "#818cf8", "#4f46e5", "#1e1b4b"]

type CountryData = {
  alpha_3: string
  name: string
  visitors: number
  code: string
}

function iso2(code: string) {
  return (code || "").replace(/\0/g, "").trim().toUpperCase()
}

function setupProjection(width: number, height: number) {
  const projection = d3.geoMercator()
    .rotate(MAP_ROTATE)
    .scale(width * 0.158)
    .translate([width / 2, height / 1.5])
  return { projection, path: d3.geoPath().projection(projection) }
}

let centroidCache: Map<string, [number, number]> | null = null
function countryCentroids() {
  if (centroidCache) return centroidCache
  const out = new Map<string, [number, number]>()
  for (const feature of parseWorldTopoJsonToGeoJsonFeatures()) {
    const c = d3.geoCentroid(feature as unknown as d3.GeoPermissibleObjects)
    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) out.set(feature.properties.a3, c)
  }
  centroidCache = out
  return out
}

export function WorldMap({
  rows,
  live = [],
  onCountryClick,
}: {
  rows: Array<{ name: string, value: number, label?: string }>
  live?: Array<{ country: string }>
  onCountryClick?: (code: string) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number, y: number, hovered: string | null }>({
    x: 0,
    y: 0,
    hovered: null,
  })

  const { maxValue, dataByAlpha3Code } = useMemo(() => {
    const dataByAlpha3Code = new Map<string, CountryData>()
    let maxValue = 0
    for (const row of rows) {
      const code = iso2(row.name)
      if (!code || code === "(NONE)") continue
      const entry = COUNTRIES_BY_TWO_LETTER_CODE[code]
      if (!entry?.alpha_3) continue
      const visitors = Number(row.value) || 0
      if (visitors > maxValue) maxValue = visitors
      dataByAlpha3Code.set(entry.alpha_3, {
        alpha_3: entry.alpha_3,
        visitors,
        name: row.label || countryName(code),
        code,
      })
    }
    return { maxValue, dataByAlpha3Code }
  }, [rows])

  const liveByAlpha3 = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of live) {
      const a3 = COUNTRIES_BY_TWO_LETTER_CODE[iso2(item.country)]?.alpha_3
      if (!a3) continue
      counts.set(a3, (counts.get(a3) || 0) + 1)
    }
    return counts
  }, [live])

  const colorFor = useMemo(() => {
    const ramp = d3.interpolateRgbBasis(COLOR_STOPS)
    const t = d3.scaleSqrt().domain([0, maxValue || 1]).range([0.12, 1]).clamp(true)
    return (value: number) => ramp(t(value))
  }, [maxValue])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const svg = d3.select(el)
    svg.selectAll("*").remove()

    const root = svg.append("g").attr("class", "map-root")
    const { path, projection } = setupProjection(WIDE_WIDTH, WIDE_HEIGHT)
    const features = parseWorldTopoJsonToGeoJsonFeatures()

    root.append("rect")
      .attr("width", WIDE_WIDTH)
      .attr("height", WIDE_HEIGHT)
      .attr("fill", OCEAN)
      .attr("pointer-events", "none")

    const countries = root.append("g").attr("class", "countries")
      .selectAll("path.country")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("stroke", BORDER)
      .attr("stroke-width", 0.55)
      .attr("stroke-linejoin", "round")
      .attr("d", path as never)
      .attr("fill", (d) => {
        const row = dataByAlpha3Code.get(d.properties.a3)
        return row?.visitors ? colorFor(row.visitors) : EMPTY_FILL
      })
      .attr("cursor", (d) => dataByAlpha3Code.get(d.properties.a3)?.visitors ? "pointer" : "default")

    const highlight = root.append("path")
      .attr("fill", "none")
      .attr("stroke", "#4f46e5")
      .attr("stroke-width", 1.8)
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")

    countries
      .on("mouseover", function (event, country) {
        const [x, y] = d3.pointer(event, svg.node()?.parentNode)
        setTooltip({ x, y, hovered: country.properties.a3 })
        highlight.attr("d", this.getAttribute("d"))
        d3.select(this).attr("stroke", "#4f46e5").attr("stroke-width", 1.1)
      })
      .on("mousemove", function (event) {
        const [x, y] = d3.pointer(event, svg.node()?.parentNode)
        setTooltip((cur) => ({ ...cur, x, y }))
      })
      .on("mouseout", function () {
        setTooltip({ x: 0, y: 0, hovered: null })
        highlight.attr("d", null)
        d3.select(this).attr("stroke", BORDER).attr("stroke-width", 0.55)
      })
      .on("click", (event, country) => {
        if (event.defaultPrevented) return
        const row = dataByAlpha3Code.get((country as WorldJsonCountryData).properties.a3)
        if (row?.code) onCountryClick?.(row.code)
      })

    const dots = root.append("g").attr("class", "live-dots").attr("pointer-events", "none")
    const centroids = countryCentroids()
    for (const [a3, count] of liveByAlpha3) {
      const ll = centroids.get(a3)
      if (!ll) continue
      const xy = projection(ll)
      if (!xy) continue
      const n = Math.min(count, 8)
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2
        const dist = n === 1 ? 0 : 3.2 + i * 0.7
        const x = xy[0] + Math.cos(angle) * dist
        const y = xy[1] + Math.sin(angle) * dist
        dots.append("circle").attr("class", "live-dot-pulse").attr("cx", x).attr("cy", y).attr("r", 7)
        dots.append("circle").attr("class", "live-dot").attr("cx", x).attr("cy", y).attr("r", 2.8)
      }
    }

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 8])
      .on("zoom", (ev) => {
        root.attr("transform", ev.transform.toString())
      })
    zoomRef.current = zoom
    svg.call(zoom)

    return () => {
      svg.on(".zoom", null)
      svg.selectAll("*").remove()
    }
  }, [colorFor, dataByAlpha3Code, liveByAlpha3, onCountryClick])

  function zoomBy(k: number) {
    const el = svgRef.current
    if (!el || !zoomRef.current) return
    d3.select(el).transition().duration(180).call(zoomRef.current.scaleBy, k)
  }

  function resetZoom() {
    const el = svgRef.current
    if (!el || !zoomRef.current) return
    d3.select(el).transition().duration(180).call(zoomRef.current.transform, d3.zoomIdentity)
  }

  const hovered = tooltip.hovered ? dataByAlpha3Code.get(tooltip.hovered) : undefined
  const hoveredLive = tooltip.hovered ? liveByAlpha3.get(tooltip.hovered) || 0 : 0

  return (
    <div className="relative h-full w-full">
      <div className="map-stage relative overflow-hidden">
        <div className="absolute top-2.5 right-2.5 z-10 flex overflow-hidden rounded-md border border-white/70 bg-white/90 shadow-sm backdrop-blur-sm">
          <button type="button" className="px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50" onClick={() => zoomBy(1.35)} aria-label="放大">+</button>
          <button type="button" className="border-l border-gray-200 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50" onClick={() => zoomBy(1 / 1.35)} aria-label="缩小">−</button>
          <button type="button" className="border-l border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50" onClick={resetZoom}>重置</button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDE_WIDTH} ${WIDE_HEIGHT}`}
          className="map-viewport h-auto w-full cursor-grab active:cursor-grabbing"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <span>滚轮缩放 · 拖动移动</span>
        <span className="inline-flex items-center gap-1">
          少
          {COLOR_STOPS.map((c) => (
            <span key={c} className="inline-block h-2 w-3.5 rounded-sm" style={{ background: c }} />
          ))}
          多
        </span>
      </div>
      {hovered ? (
        <div
          className="pointer-events-none absolute z-50 translate-x-2 translate-y-2 rounded-md bg-white p-2 shadow-lg ring-1 ring-black/5"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <CountryFlag code={hovered.code} shape="rect" />
            {hovered.name}
          </div>
          <div className="flex items-center gap-x-1 text-sm">
            <strong>{numberShort(hovered.visitors)}</strong>
            访客
          </div>
          {hoveredLive ? (
            <div className="mt-0.5 flex items-center gap-x-1 text-sm text-green-600">
              <strong>{hoveredLive}</strong>
              当前在线
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function MapCard({
  rows,
  live = [],
  liveCount = 0,
  heatmap = [],
  onCountryClick,
}: {
  rows: Array<{ name: string, value: number, label?: string }>
  live?: Array<{ country: string }>
  liveCount?: number
  heatmap?: HeatCell[]
  onCountryClick?: (code: string) => void
}) {
  return (
    <section className="relative col-span-full w-full overflow-hidden rounded-md bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
        <div className="lg:col-span-7">
          <div className="mb-2 flex w-full items-center justify-between border-b border-gray-200 pb-3">
            <h3 className="text-sm font-bold text-gray-900">地图</h3>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <span className="inline-block size-2 rounded-full bg-green-500" />
              {liveCount} 当前访客
            </div>
          </div>
          <WorldMap rows={rows} live={live} onCountryClick={onCountryClick} />
        </div>
        <div className="lg:col-span-3 lg:border-l lg:border-gray-100 lg:pl-6">
          <TrafficHeatmap cells={heatmap} />
        </div>
      </div>
    </section>
  )
}
