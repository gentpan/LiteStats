import { lookup } from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import ipaddr from "ipaddr.js"

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast" } catch { return false }
}

export async function resolvePublicTarget(raw: string) {
  const url = new URL(raw)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("只允许无凭据的 HTTP(S) 地址")
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(row => !isPublicAddress(row.address))) throw new Error("监控目标必须是公网地址")
  return { url, ...addresses[0] }
}

export async function publicStatus(raw: string, redirects = 0): Promise<number> {
  if (redirects > 5) throw new Error("重定向次数过多")
  const { url, address, family } = await resolvePublicTarget(raw)
  const result = await new Promise<{ status: number, location?: string }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http
    const request = transport.request(url, {
      method: "GET",
      headers: { "User-Agent": "LiteStats-Monitor/1.0", Accept: "*/*" },
      // Pin the checked address so DNS rebinding cannot change the destination.
      lookup: (_hostname, _options, callback) => callback(null, address, family),
      signal: AbortSignal.timeout(12_000),
    }, response => {
      resolve({ status: response.statusCode || 0, location: response.headers.location })
      response.destroy()
    })
    request.on("error", reject)
    request.end()
  })
  if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
    return publicStatus(new URL(result.location, raw).href, redirects + 1)
  }
  return result.status
}
