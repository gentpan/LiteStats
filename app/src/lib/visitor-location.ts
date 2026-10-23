import { createHash } from "node:crypto"
import ipaddr from "ipaddr.js"
import { subdivisionCode } from "./geography"

export type VisitorLocation = {country: string; region: string; subdivision: string; city: string}
const empty: VisitorLocation = {country: "", region: "", subdivision: "", city: ""}
const cache = new Map<string, {expires: number; value: VisitorLocation}>()
const pending = new Map<string, Promise<VisitorLocation>>()
const MAX_CACHE = 5000
const MAX_PENDING = 8

function publicIp(value: string) {
  try {
    const address = ipaddr.process(value.trim())
    return address.range() === "unicast" ? address.toString() : ""
  } catch { return "" }
}

/** The reverse proxy appends/sets the verified peer at the end of X-Forwarded-For. */
export function visitorAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "0"
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150) : ""
}

export function parseVisitorLocation(data: unknown): VisitorLocation {
  if (!data || typeof data !== "object") return {...empty}
  const row = data as Record<string, unknown>
  const country = text(row.country_code).toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) return {...empty}
  const region = text(row.province) || text(row.region)
  return {country, region, subdivision: subdivisionCode(country, region), city: text(row.city)}
}

async function lookup(ip: string): Promise<VisitorLocation> {
  const signal = AbortSignal.timeout(1500)
  const response = await fetch(`https://api.cnip.io/geoip/${encodeURIComponent(ip)}`, {signal, redirect: "error", headers: {Accept: "application/json"}})
  if (!response.ok || !response.body) throw new Error("Location unavailable")
  // Bound provider data without retaining or logging its echoed IP, ASN or coordinates.
  const reader = response.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) throw new Error("Location response too large")
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength}
  return parseVisitorLocation(JSON.parse(new TextDecoder().decode(bytes)))
}

/** Opt-in provider; failures leave collection available with the existing country hint. */
export async function visitorLocation(address: string, countryHint = ""): Promise<VisitorLocation> {
  const fallback = {...empty, country: /^[A-Za-z]{2}$/.test(countryHint) ? countryHint.toUpperCase() : ""}
  if (process.env.GEOIP_PROVIDER !== "cnip") return fallback
  const ip = publicIp(address)
  if (!ip) return fallback
  // Only a process-local hash is retained as the cache key; no IP is persisted.
  const key = createHash("sha256").update(ip).digest("hex")
  const stored = cache.get(key)
  if (stored && stored.expires > Date.now()) return stored.value.country ? stored.value : fallback
  if (stored) cache.delete(key)
  const waiting = pending.get(key)
  if (waiting) {const result = await waiting; return result.country ? result : fallback}
  if (pending.size >= MAX_PENDING) return fallback
  const work = lookup(ip).catch(() => ({...empty})).then(value => {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
    cache.set(key, {value, expires: Date.now() + (value.country ? 86400_000 : 60_000)})
    return value
  }).finally(() => {pending.delete(key)})
  pending.set(key, work)
  const result = await work
  return result.country ? result : fallback
}
