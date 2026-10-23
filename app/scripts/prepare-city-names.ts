import { resolve } from "node:path"
import { gzipSync } from "node:zlib"
import { cityNameKey, simplifyCityText, type CityNameRecord } from "../src/lib/city-name-key"
import { subdivisionCode } from "../src/lib/geography"

// Input is a public GeoNames extraction, never an analytics database/export.
const input = process.argv[2]
if (!input) throw new Error("Pass the public GeoNames extraction JSON path")
const source: Array<{id:string; country:string; name:string; ascii:string; adminNames:string[]; zhNames:string[]; aliases:string[]; populated:boolean; population:number}> = await Bun.file(resolve(input)).json()
const records: CityNameRecord[] = source.filter(row => row.zhNames.some(name => /\p{Script=Han}/u.test(name) && !/\p{L}/u.test(name.replace(/\p{Script=Han}/gu,"")))).map(row => {
  const region = row.adminNames.map(name => subdivisionCode(row.country,name)).find(Boolean) || ""
  const aliases = [...new Set([row.name,row.ascii,...row.aliases.filter(name => /^[\p{Script=Latin}\p{M}\p{P}\p{Z}\p{N}\s]+$/u.test(name))].filter(Boolean).map(cityNameKey))].sort()
  return [row.id,row.country,region,simplifyCityText(row.zhNames.find(name => /\p{Script=Han}/u.test(name) && !/\p{L}/u.test(name.replace(/\p{Script=Han}/gu,"")))!),row.name,aliases,[...new Set([row.name,row.ascii].map(cityNameKey))],row.populated,row.population]
})
records.sort((a,b) => Number(a[0]) - Number(b[0]))
const countries: Record<string, CityNameRecord[]> = {}
for (const record of records) (countries[record[1]] ||= []).push(record)
const packed = Object.fromEntries(Object.entries(countries).sort(([a],[b]) => a.localeCompare(b)).map(([country, entries]) => [country,gzipSync(JSON.stringify(entries),{level:9}).toString("base64")]))
await Bun.write(new URL("../src/assets/city-names.json",import.meta.url), JSON.stringify(packed)+"\n")
console.log(`Prepared ${records.length} public city/district name records`)
