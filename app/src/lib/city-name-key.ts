import { Converter } from "opencc-js/t2cn"

export type CityNameRecord = [id: string, country: string, subdivision: string, chinese: string, original: string, aliases: string[], primary: string[], populated: boolean, population: number]
export const simplifyCityText = Converter({from:"t",to:"cn"})

export function cityNameKey(value: string) {
  return simplifyCityText(value).normalize("NFKD").toLowerCase().replace(/[\p{M}\p{P}\p{Z}\s]/gu, "")
}
