import { getDomain } from "tldts"
import { domainToASCII } from "node:url"
import { followPublic, inspectCertificate, checkError, type CertificateResult } from "./site-check-network"
import { inspectCnWhois } from "./site-check-whois"

export type DomainExpiry = {domain: string | null; expiresAt: string | null; error: string | null; registeredAt?: string | null; registrar?: string | null; retryable?: boolean}
type CachedExpiry = {stale?: boolean; lastSuccessAt?: string}
export type ExpirySnapshot = {checkedAt: string; domain: DomainExpiry & CachedExpiry; certificate: CertificateResult & CachedExpiry}
export type HttpCheck = {checkedAt: string; ok: boolean; status: number | null; durationMs: number | null; error: string | null}

export function siteCheckUrl(domain: string, path = "/") {
  const base = new URL(`https://${domain}/`)
  const url = new URL(path, base)
  if (!path.startsWith("/") || path.startsWith("//") || url.origin !== base.origin || url.username || url.password || url.port || url.hash || path.length > 2048) {
    throw new Error("请输入本站的检查路径，例如 / 或 /health")
  }
  return url
}

export function rdapExpiry(data: unknown): string | null {
  const events = (data as {events?: Array<{eventAction?: string; eventDate?: string}>})?.events
  if (!Array.isArray(events)) return null
  const dates = events.filter(event => event.eventAction === "expiration").map(event => Date.parse(event.eventDate || "")).filter(Number.isFinite)
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null
}

export function rdapRegistration(data: unknown): Pick<DomainExpiry, "registeredAt" | "registrar"> {
  const row = data as {events?: Array<{eventAction?: string; eventDate?: string}>; entities?: Array<{roles?: string[]; vcardArray?: unknown}>}
  const events = Array.isArray(row?.events) ? row.events : []
  const dates = events.filter(event => event.eventAction === "registration").map(event => Date.parse(event.eventDate || "")).filter(Number.isFinite)
  const registeredAt = dates.length ? new Date(Math.min(...dates)).toISOString() : null
  const entity = Array.isArray(row?.entities) ? row.entities.find(item => item.roles?.includes("registrar")) : undefined
  const vcard = Array.isArray(entity?.vcardArray) ? entity.vcardArray[1] : null
  const field = Array.isArray(vcard) ? vcard.find(item => Array.isArray(item) && item[0] === "fn" && typeof item[3] === "string") : null
  const registrar = field?.[3]?.trim().slice(0, 200) || null
  return {registeredAt, registrar}
}

export function whoGaExpiry(data: unknown): string | null {
  const value = (data as {expiresAt?: unknown})?.expiresAt
  if (typeof value !== "string") return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export function whoGaRegistration(data: unknown): Pick<DomainExpiry, "registeredAt" | "registrar"> {
  const row = data as {registeredAt?: unknown; registrationDate?: unknown; registrar?: unknown}
  const value = typeof row?.registeredAt === "string" ? row.registeredAt : typeof row?.registrationDate === "string" ? row.registrationDate : ""
  const timestamp = Date.parse(value)
  const registeredAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
  const registrar = typeof row?.registrar === "string" ? row.registrar.trim().slice(0, 200) || null : null
  return {registeredAt, registrar}
}

type Bootstrap = {services: [string[], string[]][]}
let bootstrap: {value: Bootstrap; expires: number} | null = null
let pendingBootstrap: Promise<Bootstrap> | null = null
async function rdapBootstrap(): Promise<Bootstrap> {
  if (bootstrap && bootstrap.expires > Date.now()) return bootstrap.value
  if (!pendingBootstrap) pendingBootstrap = (async () => {
    const response = await followPublic(new URL("https://data.iana.org/rdap/dns.json"), AbortSignal.timeout(10_000), 1_000_000)
    if (response.status !== 200) throw new Error("域名到期信息暂时不可用")
    const value = JSON.parse(response.body) as Bootstrap
    if (!Array.isArray(value.services)) throw new Error("域名到期信息格式无效")
    bootstrap = {value, expires: Date.now() + 86400_000}
    return value
  })().finally(() => {pendingBootstrap = null})
  return pendingBootstrap
}

const domainLookup = {bootstrap: rdapBootstrap, fetch: followPublic, whois: inspectCnWhois}

export async function inspectDomain(hostname: string, lookup = domainLookup): Promise<DomainExpiry> {
  const registered = getDomain(hostname, {allowPrivateDomains: false})
  const domain = registered ? domainToASCII(registered).toLowerCase() : null
  if (!domain) return {domain: null, expiresAt: null, error: "无法识别可注册域名", retryable: false}
  let unavailable: DomainExpiry
  try {
    const {services} = await lookup.bootstrap()
    const tld = domain.split(".").at(-1)!
    const servers = services.find(entry => entry[0]?.includes(tld))?.[1] || []
    const endpoint = servers.find(url => url.startsWith("https://"))
    if (endpoint) {
      const result = await lookup.fetch(new URL(`domain/${encodeURIComponent(domain)}`, endpoint.endsWith("/") ? endpoint : endpoint + "/"), AbortSignal.timeout(10_000), 1_000_000)
      if (result.status !== 200) throw new Error("域名到期信息暂时不可用")
      const payload = JSON.parse(result.body)
      const expiresAt = rdapExpiry(payload)
      if (expiresAt) return {domain, expiresAt, ...rdapRegistration(payload), error: null, retryable: false}
      unavailable = {domain, expiresAt: null, error: "查询服务未返回该域名的到期时间，请到注册商查看", retryable: false}
    } else {
      unavailable = {domain, expiresAt: null, error: "暂不支持该域名后缀的到期查询，请到注册商查看", retryable: false}
    }
  } catch (error) { unavailable = {domain, expiresAt: null, error: checkError(error)} }
  try {
    const result = await lookup.fetch(new URL(`https://api.who.ga/${encodeURIComponent(domain)}`), AbortSignal.timeout(10_000), 1_000_000)
    if (result.status !== 200) throw new Error("域名到期信息暂时不可用")
    const payload = JSON.parse(result.body) as {domain?: unknown}
    if (typeof payload.domain !== "string" || payload.domain.toLowerCase() !== domain) throw new Error("域名到期信息格式无效")
    const expiresAt = whoGaExpiry(payload)
    if (expiresAt) return {domain, expiresAt, ...whoGaRegistration(payload), error: null, retryable: false}
    unavailable = {domain, expiresAt: null, error: "查询服务未返回该域名的到期时间，请到注册商查看", retryable: false}
  } catch (error) { unavailable = {domain, expiresAt: null, error: checkError(error)} }
  // .com.cn and other .cn registrations share CNNIC's official WHOIS service.
  // RDAP remains preferred if the registry publishes it in the future.
  return domain.endsWith(".cn")
    ? {domain, ...await lookup.whois(domain, AbortSignal.timeout(10_000))}
    : unavailable
}

export async function checkHttp(url: URL): Promise<HttpCheck> {
  const checkedAt = new Date().toISOString()
  const start = performance.now()
  try {
    const result = await followPublic(url, AbortSignal.timeout(10_000))
    return {checkedAt, ok: result.status === 200, status: result.status, durationMs: Math.round(performance.now() - start), error: result.status === 200 ? null : `HTTP ${result.status}`}
  } catch (error) {
    return {checkedAt, ok: false, status: null, durationMs: null, error: checkError(error)}
  }
}

export async function checkExpiry(hostname: string): Promise<ExpirySnapshot> {
  const [domain, certificate] = await Promise.all([
    inspectDomain(hostname),
    inspectCertificate(hostname, AbortSignal.timeout(10_000)).catch(error => ({expiresAt: null, valid: false, error: checkError(error)})),
  ])
  return {checkedAt: new Date().toISOString(), domain, certificate}
}
