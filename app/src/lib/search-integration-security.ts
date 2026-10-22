import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { normalizeDomain } from "./site-domain"

const prefix = "litestats-secret:v1:"
type SecretField = "google:access_token" | "google:refresh_token" | "google:client_config" | "bing:api_key"
const encryptionKey = (key: string) => createHash("sha256").update(`litestats-search-integrations:${key}`).digest()

/** Existing plaintext is read without rewriting it; only explicit new writes are sealed. */
export function sealSearchSecret(value: string, siteId: number, field: SecretField, key: string) {
  if (!value) return ""
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv)
  cipher.setAAD(Buffer.from(`${siteId}:${field}`))
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return prefix + [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(":")
}

export function openSearchSecret(value: string, siteId: number, field: SecretField, key: string) {
  if (!value.startsWith("litestats-secret:")) return value
  try {
    if (!value.startsWith(prefix)) throw new Error()
    const parts = value.slice(prefix.length).split(":")
    if (parts.length !== 3 || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) throw new Error()
    const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, "base64url"))
    if (iv.length !== 12 || tag.length !== 16) throw new Error()
    const cipher = createDecipheriv("aes-256-gcm", encryptionKey(key), iv)
    cipher.setAAD(Buffer.from(`${siteId}:${field}`))
    cipher.setAuthTag(tag)
    return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8")
  } catch { throw new Error("搜索平台密钥无法读取，请重新保存配置或重新授权") }
}

/** Prefix paths remain meaningful platform resources; hostname boundaries must match the site. */
export function searchResourceMatchesSite(resource: string, domain: string, provider: "google" | "bing") {
  try {
    const value = resource.trim()
    let host: string
    if (provider === "google" && value.startsWith("sc-domain:")) {
      const name = value.slice("sc-domain:".length)
      if (!name || /[\s/:?#@]/.test(name)) return false
      host = name
    } else {
      const url = new URL(value)
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.port) return false
      host = url.hostname
    }
    return normalizeDomain(host) === normalizeDomain(domain)
  } catch { return false }
}

export function requireSearchResource(resource: string, domain: string, provider: "google" | "bing") {
  if (!searchResourceMatchesSite(resource, domain, provider)) throw new Error("请选择本站域名或 www 别名对应的搜索平台资源")
  return resource.trim()
}

/** A new Google account must never inherit the previous account's credentials or property. */
export function googleReauthorizationValues(previous: {email: string, refresh_token: string, property: string | null} | null, next: {email: string, refresh_token: string, property?: string}, domain: string) {
  const sameAccount = !!previous?.email && previous.email.trim().toLowerCase() === next.email.trim().toLowerCase()
  const property = next.property || (sameAccount ? previous?.property : null)
  return {
    refresh_token: next.refresh_token || (sameAccount ? previous!.refresh_token : ""),
    property: property && searchResourceMatchesSite(property, domain, "google") ? property : null,
  }
}

type Site = {id: number, domain: string}
type IntegrationDependencies = {
  user: () => Promise<{id: number}>
  site: (userId: number, domain: string, access: "admin") => Promise<Site | null>
  saveBing: (siteId: number, key: string, siteUrl: string) => Promise<void>
  removeBing: (siteId: number) => Promise<void>
  googleProperties: (siteId: number) => Promise<string[]>
  saveGoogleProperty: (siteId: number, property: string) => Promise<void>
  removeGoogle: (siteId: number) => Promise<void>
}

export function createSearchIntegrationHandlers(deps: IntegrationDependencies) {
  async function admin(domain: string) {
    const user = await deps.user()
    const site = await deps.site(user.id, domain, "admin")
    if (!site) throw new Error("没有权限")
    return site
  }
  return {
    async saveBing(data: {domain: string, apiKey: string, siteUrl: string}) {
      const site = await admin(data.domain)
      const url = requireSearchResource(data.siteUrl, site.domain, "bing")
      if (!data.apiKey.trim() || /[\u0000-\u0020\u007f]/.test(data.apiKey.trim())) throw new Error("请填写有效的 Bing API Key")
      await deps.saveBing(site.id, data.apiKey.trim(), url)
      return {ok: true}
    },
    async removeBing(data: {domain: string}) {await deps.removeBing((await admin(data.domain)).id); return {ok: true}},
    async saveGoogleProperty(data: {domain: string, property: string}) {
      const site = await admin(data.domain)
      const property = requireSearchResource(data.property, site.domain, "google")
      let properties: string[]
      try {properties = await deps.googleProperties(site.id)}
      catch {throw new Error("暂时无法核实 Google 资源，请重新连接或稍后重试")}
      if (!properties.includes(property)) throw new Error("当前 Google 账号没有该资源的访问权限，请重新连接并选择可用资源")
      await deps.saveGoogleProperty(site.id, property)
      return {ok: true}
    },
    async removeGoogle(data: {domain: string}) {await deps.removeGoogle((await admin(data.domain)).id); return {ok: true}},
  }
}
