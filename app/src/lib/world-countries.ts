import worldJson from "visionscarto-world-atlas/world/50m.json"
import * as topojson from "topojson-client"
import countriesMeta from "./countries_meta.json"

export type WorldJsonCountryData = { properties: { a3: string } }

export function parseWorldTopoJsonToGeoJsonFeatures(): Array<WorldJsonCountryData> {
  const topology = worldJson as unknown as Parameters<typeof topojson.feature>[0]
  const countries = (worldJson as { objects: { countries: Parameters<typeof topojson.feature>[1] } }).objects.countries
  const collection = topojson.feature(topology, countries)
  return (collection as unknown as { features: WorldJsonCountryData[] }).features
}

export type CountryEntry = {
  alpha_3: string | null
  flag: string
}

const lookup: Record<string, CountryEntry> = {}
for (const [alpha2, pair] of Object.entries(countriesMeta as Record<string, string[]>)) {
  const [alpha3, flag] = pair
  lookup[alpha2] = { alpha_3: alpha3, flag }
}

export const COUNTRIES_BY_TWO_LETTER_CODE = lookup
