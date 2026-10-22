import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server"
import { db } from "./db"
import { SESSION_KEY } from "./env"
import { consumeGoogleState, createGoogleState, googleStateCookieName } from "./google-oauth-flow"
import type { Range } from "./range"
import type { Row } from "./ch"

import { getGoogleOAuthConfig } from "./google-oauth-settings"
import { bingKeywordReport, googleKeywordReport, googleProperties, keywordJson, KeywordRequestError, type KeywordPack } from "./keyword-report"
import { googleReauthorizationValues, openSearchSecret, searchResourceMatchesSite, sealSearchSecret } from "./search-integration-security"

export type SearchTerms = {
  google: KeywordPack
  bing: KeywordPack
  organic: Row[]
}

export async function googleAuthorizeUrl(siteId: number, userId: number) {
  const {clientId, clientSecret, redirectUri} = await getGoogleOAuthConfig(siteId)
  if (!clientId || !clientSecret || !redirectUri) return ""
  const state = createGoogleState(siteId, userId, SESSION_KEY)
  setCookie(googleStateCookieName(siteId), state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 })
  const scope = encodeURIComponent("email https://www.googleapis.com/auth/webmasters.readonly")
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent&response_type=code&access_type=offline&scope=${scope}&state=${state}`
}

export function verifyGoogleState(state: string) {
  return consumeGoogleState(state, SESSION_KEY, {get: getCookie, delete: name => deleteCookie(name, {path: "/"})})
}

export async function getGoogleAuth(siteId: number) {
  const res = await (await db()).query<{
    email: string
    property: string | null
    refresh_token: string
    access_token: string
    expires: Date
    site_domain: string
    credential_version: string
  }>(`SELECT g.email, g.property, g.refresh_token, g.access_token, g.expires, s.domain AS site_domain, g.xmin::text AS credential_version
       FROM google_auth g JOIN sites s ON s.id = g.site_id WHERE g.site_id = $1 LIMIT 1`, [siteId])
  const row = res.rows[0]
  if (!row) return null
  try {
    return {...row,
      property: row.property && searchResourceMatchesSite(row.property, row.site_domain, "google") ? row.property : null,
      refresh_token: openSearchSecret(row.refresh_token, siteId, "google:refresh_token", SESSION_KEY),
      access_token: openSearchSecret(row.access_token, siteId, "google:access_token", SESSION_KEY),
    }
  } catch { throw new KeywordRequestError("auth_error") }
}

export async function getBingAuth(siteId: number) {
  const res = await (await db()).query<{ api_key: string, site_url: string | null, site_domain: string }>(
    `SELECT b.api_key, b.site_url, s.domain AS site_domain FROM bing_auth b JOIN sites s ON s.id = b.site_id WHERE b.site_id = $1 LIMIT 1`,
    [siteId],
  )
  const row = res.rows[0]
  if (!row) return null
  if (!row.site_url || !searchResourceMatchesSite(row.site_url, row.site_domain, "bing")) throw new KeywordRequestError("auth_error")
  try { return {...row, api_key: openSearchSecret(row.api_key, siteId, "bing:api_key", SESSION_KEY)} }
  catch { throw new KeywordRequestError("auth_error") }
}

export async function saveBingAuth(siteId: number, apiKey: string, siteUrl: string) {
  await (await db()).query(
    `INSERT INTO bing_auth (site_id, api_key, site_url, inserted_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (site_id) DO UPDATE SET api_key = EXCLUDED.api_key, site_url = EXCLUDED.site_url, updated_at = now()`,
    [siteId, sealSearchSecret(apiKey.trim(), siteId, "bing:api_key", SESSION_KEY), siteUrl.trim()],
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
  const client = await (await db()).connect()
  try {
    await client.query("BEGIN")
    // Serialize both first connection and reauthorization, without rewriting older credentials.
    const site = (await client.query<{domain: string}>("SELECT domain FROM sites WHERE id = $1 FOR UPDATE", [siteId])).rows[0]
    if (!site) throw new Error("站点不存在")
    const previous = (await client.query<{email: string, refresh_token: string, property: string | null}>(
      "SELECT email, refresh_token, property FROM google_auth WHERE site_id = $1", [siteId],
    )).rows[0] || null
    if (previous?.refresh_token) {
      try {openSearchSecret(previous.refresh_token, siteId, "google:refresh_token", SESSION_KEY)}
      catch {previous.refresh_token = ""}
    }
    const next = googleReauthorizationValues(previous, {
      email: data.email,
      refresh_token: sealSearchSecret(data.refresh_token, siteId, "google:refresh_token", SESSION_KEY),
      property: data.property,
    }, site.domain)
    await client.query(
    `INSERT INTO google_auth (site_id, user_id, email, refresh_token, access_token, expires, property, inserted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
     ON CONFLICT (site_id) DO UPDATE SET
       user_id = EXCLUDED.user_id, email = EXCLUDED.email, refresh_token = EXCLUDED.refresh_token, access_token = EXCLUDED.access_token,
       expires = EXCLUDED.expires, property = EXCLUDED.property, updated_at = now()`,
    [siteId, userId, data.email, next.refresh_token, sealSearchSecret(data.access_token, siteId, "google:access_token", SESSION_KEY), data.expires, next.property],
    )
    await client.query("COMMIT")
  } catch (error) {await client.query("ROLLBACK"); throw error}
  finally {client.release()}
}

export async function updateGoogleProperty(siteId: number, property: string) {
  await (await db()).query(`UPDATE google_auth SET property = $2, updated_at = now() WHERE site_id = $1`, [siteId, property])
}

export async function deleteGoogleAuth(siteId: number) {
  await (await db()).query(`DELETE FROM google_auth WHERE site_id = $1`, [siteId])
}

export async function exchangeGoogleCode(code: string, siteId: number) {
  const {clientId, clientSecret, redirectUri} = await getGoogleOAuthConfig(siteId)
  const body = await keywordJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  }) as { access_token?: unknown, refresh_token?: unknown, expires_in?: unknown }
  if (typeof body?.access_token !== "string" || !body.access_token || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new KeywordRequestError("invalid_response")
  const user = await keywordJson("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  }) as { email?: unknown }
  if (typeof user?.email !== "string" || !user.email.trim()) throw new KeywordRequestError("invalid_response")
  return {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : "",
    expires: new Date(Date.now() + body.expires_in * 1000),
    email: user.email.trim(),
  }
}

async function googleAccessToken(siteId: number) {
  const auth = await getGoogleAuth(siteId)
  if (!auth) return null
  if (new Date(auth.expires).getTime() > Date.now() + 60_000) return auth
  if (!auth.refresh_token) throw new KeywordRequestError("auth_error")
  const {clientId, clientSecret} = await getGoogleOAuthConfig(siteId)
  if (!clientId || !clientSecret) throw new KeywordRequestError("auth_error")
  const body = await keywordJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: auth.refresh_token,
      grant_type: "refresh_token",
    }),
  }) as { access_token?: unknown, expires_in?: unknown }
  if (typeof body?.access_token !== "string" || !body.access_token || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new KeywordRequestError("invalid_response")
  const expires = new Date(Date.now() + body.expires_in * 1000)
  const refreshed = await (await db()).query(
    `UPDATE google_auth SET access_token = $2, expires = $3, updated_at = now() WHERE site_id = $1 AND xmin::text = $4`,
    [siteId, sealSearchSecret(body.access_token, siteId, "google:access_token", SESSION_KEY), expires, auth.credential_version],
  )
  // A concurrent reconnect/disconnect must win over a stale token refresh.
  if (!refreshed.rowCount) return getGoogleAuth(siteId)
  return { ...auth, access_token: body.access_token, expires }
}

export async function listGoogleProperties(siteId: number) {
  const auth = await googleAccessToken(siteId)
  if (!auth) return []
  const body = await keywordJson("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  })
  return googleProperties(body).filter(property => searchResourceMatchesSite(property, auth.site_domain, "google"))
}

export async function searchTermsForSite(siteId: number, range: Range, organic: Row[]): Promise<SearchTerms> {
  const [google, bing] = await Promise.all([
    googleKeywordReport(() => googleAccessToken(siteId), range),
    bingKeywordReport(() => getBingAuth(siteId)),
  ])
  return { google, bing, organic }
}
