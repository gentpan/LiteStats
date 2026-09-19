import { UIIcon, BrandIcon } from "~/components/UIIcon"
import { Surface } from "~/components/Surface"
import { ExternalVisitorMap } from "./ExternalVisitorMap"
import { MAPBOX_STYLES, type MapboxStyle } from "~/lib/map-options"
import type { MapSettings } from "~/lib/map-options"
import { useT } from "~/lib/i18n"
import { useEffect, useMemo, useRef, useState } from "react"
import * as d3 from "d3"
import { CountryFlag } from "~/components/icons"
import { countryName } from "~/lib/countries"
import { numberShort } from "~/lib/format"
import {
  COUNTRIES_BY_TWO_LETTER_CODE,
  parseWorldTopoJsonToGeoJsonFeatures,
  type WorldJsonCountryData,
} from "~/lib/world-countries"

const MAP_ROTATE: [number, number] = [-150, 0]
const WIDE_WIDTH = 960
const WIDE_HEIGHT = 420
const OCEAN = "var(--map-ocean)"
const EMPTY_FILL = "var(--map-empty)"
const BORDER = "var(--map-border)"
const COLOR_STOPS = ["#e0e7ff", "#b8c4f5", "#8b9ae8", "#6575d4"]

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

function WorldMap({
  rows,
  live = [],
  onCountryClick,
}: {
  rows: Array<{ name: string, value: number, label?: string }>
  live?: Array<{ country: string }>
  onCountryClick?: (code: string) => void
}) {
  const { t, locale } = useT()
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
        name: row.label || countryName(code, locale),
        code,
      })
    }
    return { maxValue, dataByAlpha3Code }
  }, [rows, locale])

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

    const flags = root.append("g").attr("class", "country-flags")
    for (const row of dataByAlpha3Code.values()) {
      if (!row.visitors) continue
      const center = countryCentroids().get(row.alpha_3)
      const xy = center ? projection(center) : null
      if (!xy) continue
      const marker = flags.append("g").attr("transform", `translate(${xy[0]},${xy[1]})`).attr("cursor", "pointer")
      marker.append("image").attr("href", `/flags/${row.code.toLowerCase()}.svg`).attr("x", -14).attr("y", -11).attr("width", 28).attr("height", 21)
      marker.append("title").text(`${row.name} · ${row.visitors}`)
      marker.on("click", () => onCountryClick?.(row.code))
    }

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
    <div className="relative w-full">
      <div className="map-stage relative overflow-hidden">
        <div className="absolute top-2.5 right-2.5 z-10 flex overflow-hidden rounded-sm border border-white/70 bg-white/90 shadow-sm backdrop-blur-sm">
          <button type="button" className="px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50" onClick={() => zoomBy(1.35)} aria-label={t("放大")}>+</button>
          <button type="button" className="border-l border-gray-200 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50" onClick={() => zoomBy(1 / 1.35)} aria-label={t("缩小")}>−</button>
          <button type="button" className="border-l border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50" onClick={resetZoom}>{t("重置")}</button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDE_WIDTH} ${WIDE_HEIGHT}`}
          className="map-viewport h-auto w-full cursor-grab active:cursor-grabbing"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <span>{t("滚轮缩放 · 拖动移动")}</span>
        <span className="inline-flex items-center gap-1">{t("少")}{COLOR_STOPS.map((c) => (
            <span key={c} className="inline-block h-2 w-3.5 rounded-sm" style={{ background: c }} />
          ))}{t("多")}</span>
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
            <strong>{numberShort(hovered.visitors)}</strong>{t("访客")}</div>
          {hoveredLive ? (
            <div className="mt-0.5 flex items-center gap-x-1 text-sm text-green-600">
              <strong>{hoveredLive}</strong>{t("当前在线")}</div>
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
  mapConfig,
  onCountryClick,
}: {
  rows: Array<{ name: string, value: number, label?: string }>
  live?: Array<{ country: string }>
  liveCount?: number
  mapConfig?: MapSettings | null
  onCountryClick?: (code: string) => void
}) {
  const { t, locale } = useT()
  const [provider, setProvider] = useState(mapConfig?.provider || "default")
  const [mapboxStyle, setMapboxStyle] = useState<MapboxStyle>(mapConfig?.mapboxStyle || "auto")
  const [failed, setFailed] = useState(false)
  useEffect(() => { setProvider(mapConfig?.provider || "default"); setFailed(false); setMapboxStyle(mapConfig?.mapboxStyle || "auto") }, [mapConfig?.provider, mapConfig?.apiKey, mapConfig?.mapboxToken, mapConfig?.mapboxStyle, mapConfig?.mapboxCustomStyle])
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const points = useMemo(() => rows.flatMap(row => {
    const code = iso2(row.name)
    const country = COUNTRIES_BY_TWO_LETTER_CODE[code]
    const center = country?.alpha_3 ? countryCentroids().get(country.alpha_3) : undefined
    return center ? [{code, name: row.label || countryName(code, locale), count: row.value, percent: total ? (row.value / total * 100).toFixed(1) : "0", lng: center[0], lat: center[1]}] : []
  }), [rows, total, locale])
  const external = !failed && ((provider === "google" && !!mapConfig?.apiKey) || (provider === "mapbox" && !!mapConfig?.mapboxToken))

  return (
    <section className="geography-section col-span-full">
      <div className="geography-grid geography-with-ranking">
        <Surface className="geography-map analytics-panel">
          <div className="analytics-heading">
            <h3 className="text-sm font-bold text-gray-900">{t("访客分布")}</h3>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <span className="inline-block size-2 rounded-full bg-green-500" />
              {liveCount} {t("当前访客")}</div>
          </div>
          <p className="analytics-description">{t("查看访客来自哪里，点击国家可筛选报表。")}</p>
          <div className="map-provider-switch" role="group" aria-label={t("地图服务")}>
            <button type="button" aria-pressed={!external} onClick={() => { setProvider("default"); setFailed(false) }}><UIIcon name="map" />{t("默认地图")}</button>
            <button type="button" aria-pressed={external && provider === "google"} disabled={!mapConfig?.apiKey} title={!mapConfig?.apiKey ? t("请先在站点设置的地图页面填写 Key") : undefined} onClick={() => { setProvider("google"); setFailed(false) }}><BrandIcon name="google-maps" />Google Maps</button>
            <button type="button" aria-pressed={external && provider === "mapbox"} disabled={!mapConfig?.mapboxToken} title={!mapConfig?.mapboxToken ? t("请先在站点设置中填写 Mapbox Token") : undefined} onClick={() => {setProvider("mapbox");setFailed(false)}}><BrandIcon name="mapbox" />Mapbox</button>
          </div>
          {provider === "mapbox" && mapConfig?.mapboxToken ? <label className="map-style-switch">{t("地图主题")}<select className="input" value={mapboxStyle} onChange={event => {setMapboxStyle(event.target.value as MapboxStyle);setFailed(false)}}>{MAPBOX_STYLES.filter(style => style.id !== "custom" || mapConfig.mapboxCustomStyle).map(style => <option key={style.id} value={style.id}>{t(style.label)}</option>)}</select></label> : null}
          {failed ? <p className="map-provider-note" role="status">{t("地图服务加载失败，已切回默认地图。请检查网络、凭据、域名限制、样式权限和服务配额。")}</p> : null}
          {external && mapConfig ? <ExternalVisitorMap settings={{...mapConfig, mapboxStyle}} provider={provider} points={points} onCountryClick={onCountryClick} onFailure={() => setFailed(true)} /> : <WorldMap rows={rows} live={live} onCountryClick={onCountryClick} />}
          <p className="map-provider-note">{t("按国家/地区汇总，标记不是访客的精确位置。占比按已记录的地区访客数计算。")}</p>

        </Surface>
      </div>
    </section>
  )
}
