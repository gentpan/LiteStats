import { geoCentroid } from "d3"
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson"
import { COUNTRIES_BY_TWO_LETTER_CODE, type WorldJsonCountryData } from "./world-countries"

export type MapRows = Array<{name: string; value: number; label?: string}>
export type VisitorCountry = {code: string; name: string; visitors: number; live: number; weight: number; center: [number, number]}

/** Only country aggregates are rendered locally; no visitor records go to Mapbox. */
export function mapboxVisitorData(features: WorldJsonCountryData[], rows: MapRows, live: Array<{country: string}>) {
  const normalize = (value: string) => value.replace(/\0/g, "").trim().toUpperCase()
  const totals = new Map<string, {code: string; name: string; visitors: number; live: number}>()
  const entry = (value: string) => {
    const code = normalize(value), a3 = COUNTRIES_BY_TWO_LETTER_CODE[code]?.alpha_3
    if (!a3) return null
    if (!totals.has(a3)) totals.set(a3, {code, name: code, visitors: 0, live: 0})
    return totals.get(a3)!
  }
  for (const row of rows) {
    if (!Number.isFinite(row.value) || row.value <= 0) continue
    const country = entry(row.name)
    if (country) { country.visitors += row.value; country.name = row.label || country.code }
  }
  for (const visitor of live) { const country = entry(visitor.country); if (country) country.live++ }
  const max = Math.max(1, ...[...totals.values()].map(country => country.visitors))
  const countries: VisitorCountry[] = []
  const polygons: FeatureCollection<Polygon | MultiPolygon> = {type: "FeatureCollection", features: []}
  for (const feature of features) {
    const country = totals.get(feature.properties.a3)
    if (!country) continue
    const center = geoCentroid(feature) as [number, number]
    if (!center.every(Number.isFinite)) continue
    const data = {...country, weight: Math.sqrt(country.visitors / max), center}
    countries.push(data)
    polygons.features.push({...feature, id: country.code, properties: {...country, weight: data.weight}})
  }
  return {countries, polygons}
}
