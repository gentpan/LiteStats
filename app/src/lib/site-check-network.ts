import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"
import { checkServerIdentity, connect } from "node:tls"
import ipaddr from "ipaddr.js"

export function isPublicAddress(address: string) {
  try {
    const parsed = ipaddr.process(address)
    return parsed.range() === "unicast"
  } catch { return false }
}

export function publicUrl(value: string | URL) {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !url.hostname || url.hash) {
    throw new Error("仅支持不含凭据的标准 HTTP/HTTPS 地址")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host) && !isPublicAddress(host)) throw new Error("不允许检查内网或保留地址")
  if (/^(localhost|.*\.(localhost|local|internal|invalid|test|onion))$/i.test(host)) throw new Error("不允许检查内网或保留地址")
  return url
}

async function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("检查超时"))
    signal.addEventListener("abort", abort, {once: true})
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}

/** Validate the entire answer set before any connection, including fallback addresses. */
export async function publicAddresses(host: string, signal: AbortSignal, resolver = lookup) {
  host = host.replace(/^\[|\]$/g, "")
  const answers = isIP(host) ? [{address: host, family: isIP(host)}] : await untilAborted(resolver(host, {all: true, verbatim: true}), signal)
  signal.throwIfAborted()
  if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) throw new Error("域名没有可安全访问的公网地址")
  return answers.filter((answer, index) => answers.findIndex(other => other.address === answer.address) === index)
}

export async function connectionOptions(host: string, signal: AbortSignal) {
  const addresses = await publicAddresses(host, signal)
  return {
    // Node tries other validated IPv6/IPv4 addresses on connection failure or delay.
    // The caller's abort signal still bounds the whole operation, not each attempt.
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: 250,
    lookup: ((_host, options, callback) => {
      if (options.all) callback(null, addresses)
      else callback(null, addresses[0].address, addresses[0].family)
    }) satisfies import("node:net").LookupFunction,
  }
}

export type WebResponse = {status: number; location: string | null; body: string}
export async function requestPublic(url: URL, signal: AbortSignal, bodyLimit = 0): Promise<WebResponse> {
  publicUrl(url)
  const connection = await connectionOptions(url.hostname, signal)
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      ...connection, method: "GET", agent: false, signal,
      headers: {"User-Agent": "LiteStats-SiteCheck/1.0", Accept: bodyLimit ? "application/rdap+json, application/json" : "*/*", "Accept-Encoding": "identity"},
    }, response => {
      const status = response.statusCode || 0
      const location = response.headers.location || null
      if (!bodyLimit || (status >= 300 && status < 400)) {
        resolve({status, location, body: ""})
        response.destroy()
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > bodyLimit) {
          reject(new Error("响应内容过大"))
          response.destroy()
        } else chunks.push(chunk)
      })
      response.on("end", () => resolve({status, location, body: Buffer.concat(chunks).toString("utf8")}))
      response.on("error", reject)
      response.on("aborted", () => reject(new Error("响应中断")))
    })
    request.on("error", reject)
    request.end()
  })
}

export async function followPublic(url: URL, signal: AbortSignal, bodyLimit = 0, send = requestPublic) {
  let current = publicUrl(url)
  for (let hops = 0; ; hops++) {
    signal.throwIfAborted()
    const response = await send(current, signal, bodyLimit)
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.location) return {...response, url: current.href}
    if (hops >= 3) throw new Error("跳转次数过多")
    const next = publicUrl(new URL(response.location, current))
    if (current.protocol === "https:" && next.protocol !== "https:") throw new Error("HTTPS 跳转到了不安全的 HTTP 地址")
    current = next
  }
}

export type CertificateResult = {expiresAt: string | null; valid: boolean; error: string | null}
export async function inspectCertificate(host: string, signal: AbortSignal): Promise<CertificateResult> {
  publicUrl(`https://${host}/`)
  const connection = await connectionOptions(host, signal)
  return new Promise((resolve, reject) => {
    // Read expiry even for an expired/untrusted certificate. No HTTP or credentials
    // are sent on this socket; validity is reported separately and never assumed.
    const socket = connect({...connection, host: host.replace(/^\[|\]$/g, ""), port: 443, servername: host, rejectUnauthorized: false})
    const abort = () => socket.destroy(new Error("证书检查超时"))
    signal.addEventListener("abort", abort, {once: true})
    if (signal.aborted) abort()
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate()
      const expires = Date.parse(cert.valid_to)
      const starts = Date.parse(cert.valid_from)
      const identityError = cert && checkServerIdentity(host, cert)
      const valid = socket.authorized && !identityError && Number.isFinite(expires) && starts <= Date.now() && expires > Date.now()
      resolve({expiresAt: Number.isFinite(expires) ? new Date(expires).toISOString() : null, valid,
        error: valid ? null : expires <= Date.now() ? "证书已过期" : identityError ? "证书域名不匹配" : "证书未通过验证"})
      socket.destroy()
    })
    socket.on("error", reject)
    socket.on("close", () => signal.removeEventListener("abort", abort))
  })
}

export function checkError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code || ""
  if (/TIMEOUT|ABORT/.test(code) || (error instanceof Error && /timeout|aborted|超时/i.test(error.message))) return "检查超时"
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "域名解析失败"
  if (/CERT|TLS|SSL/.test(code)) return "HTTPS 证书验证失败"
  if (/ECONN|EHOST|ENET/.test(code)) return "无法连接网站"
  // Do not expose low-level addresses, stacks or response bodies in reports.
  return error instanceof Error && /^[\u4e00-\u9fff]/.test(error.message) ? error.message.slice(0, 120) : "检查失败，请稍后重试"
}
