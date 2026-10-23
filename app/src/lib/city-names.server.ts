import data from "../assets/city-names.json"
import { gunzipSync } from "node:zlib"
import { cityNameKey, simplifyCityText, type CityNameRecord } from "./city-name-key"
import { subdivisionCode } from "./geography"

type CountryIndex = {byId:Map<string, CityNameRecord>; byName:Map<string, CityNameRecord[]>}
const packed: Record<string,string> = data
const cache = new Map<string,CountryIndex>()
function countryIndex(country: string): CountryIndex {
  const cached = cache.get(country)
  if (cached) {cache.delete(country);cache.set(country,cached);return cached}
  const index: CountryIndex = {byId:new Map(),byName:new Map()}
  const records: CityNameRecord[] = packed[country] ? JSON.parse(gunzipSync(Buffer.from(packed[country],"base64")).toString("utf8")) : []
  for (const record of records) {
    index.byId.set(record[0],record)
    for (const name of record[5]) {
      const entries = index.byName.get(name)
      if (entries) entries.push(record)
      else index.byName.set(name,[record])
    }
  }
  if (cache.size >= 4) cache.delete(cache.keys().next().value!)
  cache.set(country,index)
  return index
}

/** Translate display text only; never change the stored city key or aggregate counts. */
export function chineseCityName(country: string, name: string, region = "", geonameId = "0"): string {
  country = country.trim().toUpperCase()
  const original = name.trim()
  // Chinese provider/historical text needs script normalization, not geocoding.
  if (/\p{Script=Han}/u.test(original) && !/\p{L}/u.test(original.replace(/\p{Script=Han}/gu,""))) return simplifyCityText(original)
  const {byId,byName} = countryIndex(country)
  const id = geonameId !== "0" ? geonameId : /^\d+$/.test(original) ? original : ""
  if (id) {
    const exact = byId.get(id)
    return exact?.[1] === country ? exact[3] : "暂无中文名称"
  }
  let candidates = byName.get(cityNameKey(original)) || []
  const subdivision = subdivisionCode(country,region)
  if (subdivision) {
    const scoped = candidates.filter(record => record[2] === subdivision)
    candidates = scoped.length ? scoped : candidates.filter(record => !record[2])
  }
  const primary = candidates.filter(record => record[6].includes(cityNameKey(original)))
  if (primary.length) candidates = primary
  const populated = candidates.filter(record => record[7])
  if (populated.length) candidates = populated
  // A large city can share its romanization with a small village in the same province.
  // Only prefer the population leader when it is clearly dominant; otherwise stay unknown.
  candidates.sort((a,b) => b[8] - a[8])
  if (candidates[0]?.[8] >= 10000 && candidates[0][8] >= Math.max(1,candidates[1]?.[8] || 0) * 10) return candidates[0][3]
  // Same names can refer to different cities, including Suzhou in two provinces.
  const translations = new Set(candidates.map(record => record[3]))
  return translations.size === 1 ? translations.values().next().value! : "暂无中文名称"
}
