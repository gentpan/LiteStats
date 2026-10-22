import { createDecipheriv, createHash } from "node:crypto"
import { z } from "zod"
import { db } from "./db"
import { SESSION_KEY } from "./env"
import { openSearchSecret, sealSearchSecret } from "./search-integration-security"

export const googleOAuthSchema = z.object({
  clientId: z.string().trim().max(512).regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "请填写有效的 Google Client ID"),
  clientSecret: z.string().trim().max(4096),
  redirectUri: z.string().trim().url().max(2048).refine(value => {
    try {
    const url = new URL(value)
    return (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) && url.pathname === "/api/auth/google" && !url.search && !url.hash && !url.username && !url.password
    } catch { return false }
  }, "回调地址须为 HTTPS（本地可用 HTTP），路径为 /api/auth/google"),
})
type Config = z.infer<typeof googleOAuthSchema>
const unreadable = "Google OAuth 配置无法读取，请重新填写客户端信息和密钥。"
class GoogleOAuthConfigError extends Error { constructor() {super(unreadable)} }

export function decodeGoogleOAuthConfig(value: string, siteId: number, key: string): Config {
  try {
    if (value.startsWith("litestats-secret:")) return googleOAuthSchema.parse(JSON.parse(openSearchSecret(value, siteId, "google:client_config", key)))
    // Legacy encrypted configurations stay readable without touching their stored values.
    const [iv, tag, data] = value.split(":").map(part => Buffer.from(part, "base64"))
    const cipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(`litestats-google-oauth:${key}`).digest(), iv)
    cipher.setAuthTag(tag)
    return googleOAuthSchema.parse(JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString()))
  } catch { throw new GoogleOAuthConfigError() }
}

export function prepareGoogleOAuthConfig(input: Config, previous: Config | null) {
  const config = googleOAuthSchema.parse(input)
  if (!config.clientSecret && previous?.clientId !== config.clientId) throw new Error("新增或更换 Google Client ID 时，请填写对应的 Client Secret")
  config.clientSecret ||= previous?.clientSecret || ""
  if (!config.clientSecret) throw new Error("请填写 Client Secret")
  return config
}

let schema: Promise<void> | null = null
async function table() {
  const pool = await db()
  if (!schema) schema = (async () => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(716204, 5)")
      await client.query(`CREATE TABLE IF NOT EXISTS site_google_oauth_config (
        site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
        encrypted text NOT NULL
      )`)
      await client.query("COMMIT")
    } catch (error) {await client.query("ROLLBACK"); throw error}
    finally {client.release()}
  })().catch(error => {schema = null; throw error})
  await schema
  return pool
}
export async function getGoogleOAuthConfig(siteId: number): Promise<Config> {
  const result = await (await table()).query<{encrypted: string}>("SELECT encrypted FROM site_google_oauth_config WHERE site_id=$1", [siteId])
  return result.rows[0] ? decodeGoogleOAuthConfig(result.rows[0].encrypted, siteId, SESSION_KEY) : {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  }
}
export async function googleOAuthPublicConfig(siteId: number) {
  try {
    const config = await getGoogleOAuthConfig(siteId)
    return {clientId: config.clientId, redirectUri: config.redirectUri, hasSecret: !!config.clientSecret, configured: !!(config.clientId && config.clientSecret && config.redirectUri), error: undefined as string | undefined}
  } catch (error) {
    if (!(error instanceof GoogleOAuthConfigError)) throw error
    return {clientId: "", redirectUri: "", hasSecret: false, configured: false, error: unreadable}
  }
}
export async function saveGoogleOAuthConfig(siteId: number, input: Config) {
  let previous: Config | null = null
  try {previous = await getGoogleOAuthConfig(siteId)} catch (error) {if (!(error instanceof GoogleOAuthConfigError)) throw error}
  const config = prepareGoogleOAuthConfig(input, previous)
  const client = await (await table()).connect()
  try {
    await client.query("BEGIN")
    await client.query("INSERT INTO site_google_oauth_config(site_id,encrypted) VALUES($1,$2) ON CONFLICT(site_id) DO UPDATE SET encrypted=EXCLUDED.encrypted", [siteId, sealSearchSecret(JSON.stringify(config), siteId, "google:client_config", SESSION_KEY)])
    if (!previous || config.clientId !== previous.clientId || config.clientSecret !== previous.clientSecret || config.redirectUri !== previous.redirectUri) {
      await client.query("DELETE FROM google_auth WHERE site_id=$1", [siteId])
    }
    await client.query("COMMIT")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release() }
}
