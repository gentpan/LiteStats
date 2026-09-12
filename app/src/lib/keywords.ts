import { db } from "./db"
import { SESSION_KEY } from "./env"
import { createHmac } from "node:crypto"
import type { Range } from "./range"
import type { Row } from "./ch"

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || ""

export type KeywordPack = {
  configured: boolean
  rows: Row[]
  error?: string
}

export type SearchTerms = {
  google: KeywordPack
  bing: KeywordPack
  organic: Row[]
}

export function googleOAuthEnabled() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI)
}

export function googleAuthorizeUrl(siteId: number) {
  const state = createHmac("sha256", SESSION_KEY).update(`gsc:${siteId}`).digest("hex") + `.${siteId}`
  const scope = encodeURIComponent("email https://www.googleapis.com/auth/webmasters.readonly")
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&prompt=consent&response_type=code&access_type=offline&scope=${scope}&state=${state}`
}

export function verifyGoogleState(state: string) {
  const [sig, id] = String(state || "").split(".")
  const siteId = Number(id)
  if (!sig || !siteId) return null
  const expect = createHmac("sha256", SESSION_KEY).update(`gsc:${siteId}`).digest("hex")
  if (sig !== expect) return null
  return siteId
}

export async function getGoogleAuth(siteId: number) {
  const res = await (await db()).query<{
    email: string
    property: string | null
    refresh_token: string
    access_token: string
    expires: Date
  }>(`SELECT email, property, refresh_token, access_token, expires FROM google_auth WHERE site_id = $1 LIMIT 1`, [siteId])
  return res.rows[0] || null
}

export async function getBingAuth(siteId: number) {
  const res = await (await db()).query<{ api_key: string, site_url: string | null }>(
    `SELECT api_key, site_url FROM bing_auth WHERE site_id = $1 LIMIT 1`,
    [siteId],
  )
  return res.rows[0] || null
}

export async function saveBingAuth(siteId: number, apiKey: string, siteUrl: string) {
  await (await db()).query(
    `INSERT INTO bing_auth (site_id, api_key, site_url, inserted_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (site_id) DO UPDATE SET api_key = EXCLUDED.api_key, site_url = EXCLUDED.site_url, updated_at = now()`,
    [siteId, apiKey.trim(), siteUrl.trim()],
  )
}

export async function deleteBingAuth(siteId: number) {
  await (await db()).query(`DELETE FROM bing_auth WHERE site_id = $1`, [siteId])
}

export async function saveGoogleAuth(siteId: number, userId: number, data: {
  email: string
  refresh_token: string
  access_token: string
  expires: Date
  property?: string
}) {
  await (await db()).query(
    `INSERT INTO google_auth (site_id, user_id, email, refresh_token, access_token, expires, property, inserted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
     ON CONFLICT (site_id) DO UPDATE SET
       email = EXCLUDED.email, refresh_token = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), google_auth.refresh_token), access_token = EXCLUDED.access_token,
       expires = EXCLUDED.expires, property = COALESCE(EXCLUDED.property, google_auth.property), updated_at = now()`,
    [siteId, userId, data.email, data.refresh_token, data.access_token, data.expires, data.property || null],
  )
}

export async function updateGoogleProperty(siteId: number, property: string) {
  await (await db()).query(`UPDATE google_auth SET property = $2, updated_at = now() WHERE site_id = $1`, [siteId, property])
}

export async function deleteGoogleAuth(siteId: number) {
  await (await db()).query(`DELETE FROM google_auth WHERE site_id = $1`, [siteId])
}

export async function exchangeGoogleCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  })
  if (!res.ok) throw new Error("Google 授权失败")
  const body = await res.json() as { access_token: string, refresh_token?: string, expires_in: number }
  const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  })
  const user = await profile.json() as { email?: string }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || "",
    expires: new Date(Date.now() + (body.expires_in || 3600) * 1000),
    email: user.email || "",
  }
}

async function googleAccessToken(siteId: number) {
  const auth = await getGoogleAuth(siteId)
  if (!auth) return null
  if (new Date(auth.expires).getTime() > Date.now() + 60_000) return auth
  if (!auth.refresh_token) return auth
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: auth.refresh_token,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) return auth
  const body = await res.json() as { access_token: string, expires_in: number }
  const expires = new Date(Date.now() + (body.expires_in || 3600) * 1000)
  await (await db()).query(
    `UPDATE google_auth SET access_token = $2, expires = $3, updated_at = now() WHERE site_id = $1`,
    [siteId, body.access_token, expires],
  )
  return { ...auth, access_token: body.access_token, expires }
}

export async function listGoogleProperties(siteId: number) {
  const auth = await googleAccessToken(siteId)
  if (!auth) return []
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  })
  if (!res.ok) return []
  const body = await res.json() as { siteEntry?: Array<{ siteUrl: string, permissionLevel: string }> }
  const ok = new Set(["siteOwner", "siteFullUser", "siteRestrictedUser"])
  return (body.siteEntry || []).filter((s) => ok.has(s.permissionLevel)).map((s) => s.siteUrl.replace(/\/$/, ""))
}

export async function fetchGoogleKeywords(siteId: number, range: Range): Promise<KeywordPack> {
  const auth = await googleAccessToken(siteId)
  if (!auth?.property) return { configured: false, rows: [] }
  if (!range.from.startsWith("20") || !range.to.startsWith("20")) {
    return { configured: true, rows: [], error: "period_too_recent" }
  }
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(auth.property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: range.from.slice(0, 10),
        endDate: range.to.slice(0, 10),
        dimensions: ["query"],
        rowLimit: 50,
        startRow: 0,
      }),
    },
  )
  if (!res.ok) return { configured: true, rows: [], error: "google_auth_error" }
  const body = await res.json() as { rows?: Array<{ keys: string[], clicks?: number }> }
  return {
    configured: true,
    rows: (body.rows || []).map((r) => ({ name: r.keys?.[0] || "", value: Number(r.clicks || 0) })).filter((r) => r.name),
  }
}

export async function fetchBingKeywords(siteId: number): Promise<KeywordPack> {
  const auth = await getBingAuth(siteId)
  if (!auth?.api_key || !auth.site_url) return { configured: false, rows: [] }
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=${encodeURIComponent(auth.api_key)}&siteUrl=${encodeURIComponent(auth.site_url)}`
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (res.status === 401 || res.status === 403) return { configured: true, rows: [], error: "bing_auth_error" }
  if (!res.ok) return { configured: true, rows: [], error: "failed_to_list_stats" }
  const body = await res.json() as { d?: Array<{ Query?: string, query?: string, Clicks?: number, clicks?: number }> }
  const rows = (body.d || []).map((r) => ({
    name: String(r.Query || r.query || ""),
    value: Number(r.Clicks || r.clicks || 0),
  })).filter((r) => r.name)
  rows.sort((a, b) => b.value - a.value)
  return { configured: true, rows: rows.slice(0, 50) }
}

export async function searchTermsForSite(siteId: number, range: Range, organic: Row[]): Promise<SearchTerms> {
  const [google, bing] = await Promise.all([
    fetchGoogleKeywords(siteId, range).catch(() => ({ configured: false, rows: [] as Row[], error: "failed_to_list_stats" })),
    fetchBingKeywords(siteId).catch(() => ({ configured: false, rows: [] as Row[], error: "failed_to_list_stats" })),
  ])
  return { google, bing, organic }
}
