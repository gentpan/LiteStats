import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { db } from "./db"
import { SESSION_KEY } from "./env"

export const googleOAuthSchema = z.object({
  clientId: z.string().trim().max(512).regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "请填写有效的 Google Client ID"),
  clientSecret: z.string().trim().max(4096),
  redirectUri: z.string().trim().url().max(2048).refine(value => {
    const url = new URL(value)
    return (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) && url.pathname === "/api/auth/google" && !url.search && !url.hash && !url.username && !url.password
  }, "回调地址须为 HTTPS（本地可用 HTTP），路径为 /api/auth/google"),
})
type Config = z.infer<typeof googleOAuthSchema>
const key = () => createHash("sha256").update(`litestats-google-oauth:${SESSION_KEY}`).digest()
function encrypt(value: Config) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(part => part.toString("base64")).join(":")
}
function decrypt(value: string): Config {
  const [iv, tag, data] = value.split(":").map(part => Buffer.from(part, "base64"))
  const cipher = createDecipheriv("aes-256-gcm", key(), iv)
  cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString())
}
async function table() {
  const pool = await db()
  await pool.query(`CREATE TABLE IF NOT EXISTS site_google_oauth_config (
    site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
    encrypted text NOT NULL
  )`)
  return pool
}
export async function getGoogleOAuthConfig(siteId: number): Promise<Config> {
  const result = await (await table()).query<{encrypted: string}>("SELECT encrypted FROM site_google_oauth_config WHERE site_id=$1", [siteId])
  return result.rows[0] ? decrypt(result.rows[0].encrypted) : {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  }
}
export async function googleOAuthPublicConfig(siteId: number) {
  const config = await getGoogleOAuthConfig(siteId)
  return {clientId: config.clientId, redirectUri: config.redirectUri, hasSecret: !!config.clientSecret, configured: !!(config.clientId && config.clientSecret && config.redirectUri)}
}
export async function saveGoogleOAuthConfig(siteId: number, input: Config) {
  const config = googleOAuthSchema.parse(input)
  const previous = await getGoogleOAuthConfig(siteId)
  config.clientSecret ||= previous.clientSecret
  if (!config.clientSecret) throw new Error("请填写 Client Secret")
  const client = await (await table()).connect()
  try {
    await client.query("BEGIN")
    await client.query("INSERT INTO site_google_oauth_config(site_id,encrypted) VALUES($1,$2) ON CONFLICT(site_id) DO UPDATE SET encrypted=EXCLUDED.encrypted", [siteId, encrypt(config)])
    if (config.clientId !== previous.clientId || config.clientSecret !== previous.clientSecret || config.redirectUri !== previous.redirectUri) {
      await client.query("DELETE FROM google_auth WHERE site_id=$1", [siteId])
    }
    await client.query("COMMIT")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release() }
}
