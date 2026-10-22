import { createConnection } from "node:net"
import { getDomain } from "tldts"
import { connectionOptions } from "./site-check-network"

const WHOIS_HOST = "whois.cnnic.cn"
const RESPONSE_LIMIT = 64 * 1024

type WhoisExpiry = {expiresAt: string | null; error: string | null; retryable?: boolean}
const failure = (error: string, retryable = true): WhoisExpiry => ({expiresAt: null, error, retryable})

function cnDomain(value: string) {
  if (!/^[\x00-\x7f]+$/.test(value)) return null
  const domain = value.toLowerCase()
  if (domain.length > 253 || !domain.endsWith(".cn") || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  return getDomain(domain, {allowPrivateDomains: false}) === domain ? domain : null
}

function expirationDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:?\d{2})?$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, zone] = match
  const parts = [year, month, day, hour, minute, second].map(Number)
  const [y, m, d, h, min, sec] = parts
  if (y < 1900 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59 || sec > 59) return null
  const wall = new Date(Date.UTC(y, m - 1, d, h, min, sec))
  if (wall.getUTCFullYear() !== y || wall.getUTCMonth() !== m - 1 || wall.getUTCDate() !== d) return null
  // CNNIC does not document a timezone for its plain timestamps. Preserve the
  // published calendar date, rather than inventing a precise UTC expiration.
  if (!zone) return `${year}-${month}-${day}`
  let offset = 0
  if (zone !== "Z") {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.replace(":", "").slice(3, 5))
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null
    offset = (zone[0] === "+" ? 1 : -1) * (hours * 60 + minutes)
  }
  return new Date(wall.getTime() - offset * 60_000).toISOString()
}

/** Read only the requested record's explicit expiration; never retain WHOIS contact data. */
export function parseCnWhois(domain: string, response: string): WhoisExpiry {
  const expected = cnDomain(domain)
  if (!expected) return failure("WHOIS 兜底仅支持有效的 .cn 可注册域名", false)
  if (Buffer.byteLength(response, "utf8") > RESPONSE_LIMIT) return failure("WHOIS 响应内容过大，未采用到期信息，请到注册商查看")
  if (/quota\s+exceeded|rate[ -]?limit|too many (?:queries|requests)|access denied|queries?[^\r\n]*limit[^\r\n]*exceeded/i.test(response)) {
    return failure("WHOIS 查询受限，请稍后重试或到注册商查看")
  }
  if (/system is busy|try again later|temporarily unavailable|service unavailable/i.test(response)) {
    return failure("WHOIS 服务暂时繁忙，请稍后重试或到注册商查看")
  }
  const names = [...response.matchAll(/^Domain Name:[ \t]*([^\r\n]*)/gim)].map(match => match[1].trim().toLowerCase())
  if (!names.length) return /no matching record|the info does not exist|no match for|no entries found/i.test(response)
    ? failure("WHOIS 未返回该域名的记录，请到注册商查看", false)
    : failure("WHOIS 返回的信息格式无效，请稍后重试或到注册商查看")
  if (names.length !== 1 || names[0] !== expected) return failure("WHOIS 返回的域名不匹配，未采用到期信息，请到注册商查看")
  const dates = [...response.matchAll(/^Expiration Time:[ \t]*([^\r\n]*)/gim)].map(match => match[1].trim())
  if (!dates.length) return failure("WHOIS 未返回该域名的到期时间，请到注册商查看", false)
  const expiresAt = dates.length === 1 ? expirationDate(dates[0]) : null
  if (!expiresAt) return failure("WHOIS 返回的到期时间格式无效，请到注册商查看")
  return {expiresAt, error: null}
}

function transportFailure(error: unknown, signal: AbortSignal): WhoisExpiry {
  const code = (error as NodeJS.ErrnoException)?.code || ""
  if (signal.aborted || /TIMEOUT|ABORT/.test(code)) return failure("WHOIS 查询超时，请稍后重试或到注册商查看")
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return failure("WHOIS 服务域名解析失败，请稍后重试")
  if (error instanceof Error && error.message.includes("公网地址")) return failure("WHOIS 服务地址未通过公网安全校验，请稍后重试")
  return failure("无法连接 WHOIS 服务，当前网络可能限制 TCP 43 端口，请稍后重试或到注册商查看")
}

/** Fixed registry endpoint only: no command execution, user-selected servers or referrals. */
export async function inspectCnWhois(domain: string, signal: AbortSignal): Promise<WhoisExpiry> {
  const query = cnDomain(domain)
  if (!query) return failure("WHOIS 兜底仅支持有效的 .cn 可注册域名", false)
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  try {
    const connection = await connectionOptions(WHOIS_HOST, deadline)
    deadline.throwIfAborted()
    return await new Promise<WhoisExpiry>(resolve => {
      const chunks: Buffer[] = []
      let size = 0, settled = false
      const socket = createConnection({...connection, host: WHOIS_HOST, port: 43})
      const finish = (result: WhoisExpiry) => {
        if (settled) return
        settled = true
        deadline.removeEventListener("abort", abort)
        socket.destroy()
        chunks.length = 0
        resolve(result)
      }
      const abort = () => finish(transportFailure(null, deadline))
      deadline.addEventListener("abort", abort, {once: true})
      socket.on("connect", () => {if (!settled) socket.write(query + "\r\n")})
      socket.on("data", (chunk: Buffer) => {
        if (settled) return
        size += chunk.length
        if (size > RESPONSE_LIMIT) finish(failure("WHOIS 响应内容过大，未采用到期信息，请到注册商查看"))
        else chunks.push(chunk)
      })
      // Do not accept a valid-looking prefix before the server finishes its response.
      socket.on("end", () => {if (!settled) finish(parseCnWhois(query, Buffer.concat(chunks).toString("utf8")))})
      socket.on("error", error => finish(transportFailure(error, deadline)))
      socket.on("close", () => finish(failure("WHOIS 响应中断，请稍后重试或到注册商查看")))
      if (deadline.aborted) abort()
    })
  } catch (error) {return transportFailure(error, deadline)}
}
