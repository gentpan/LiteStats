import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { KeywordRequestError } from "./keyword-report"

export type GoogleState = { siteId: number, userId: number | null, valid: boolean }
export type GoogleOAuthIssue = "denied" | "expired" | "auth_error" | "failed"

export function createGoogleState(siteId: number, userId: number, key: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({siteId, userId, nonce: randomBytes(24).toString("hex"), exp: now + 600_000})).toString("base64url")
  return `${payload}.${createHmac("sha256", key).update(`gsc:${payload}`).digest("hex")}`
}

/** A signed but expired state may identify the error destination, never authorize an exchange. */
export function parseGoogleState(state: string, key: string, now = Date.now()): GoogleState | null {
  try {
    const parts = state.split(".")
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null
    const [payload, signature] = parts
    const expected = createHmac("sha256", key).update(`gsc:${payload}`).digest()
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (!Number.isSafeInteger(data.siteId) || data.siteId <= 0 || !Number.isSafeInteger(data.exp) || !/^[a-f0-9]{48}$/.test(data.nonce)) return null
    const userId = Number.isSafeInteger(data.userId) && data.userId > 0 ? data.userId : null
    return {siteId: data.siteId, userId, valid: data.exp > now && userId !== null}
  } catch { return null }
}

export const googleStateCookieName = (siteId: number) => `litestats_gsc_state_${siteId}`

export function consumeGoogleState(state: string, key: string, cookies: {get: (name: string) => string | undefined, delete: (name: string) => void}, now = Date.now()) {
  const parsed = parseGoogleState(state, key, now)
  if (!parsed) return null
  const name = googleStateCookieName(parsed.siteId)
  // Accept in-flight authorizations created before the per-site cookie change.
  const matched = cookies.get(name) === state ? name : cookies.get("litestats_gsc_state") === state ? "litestats_gsc_state" : null
  if (matched) cookies.delete(matched)
  return {...parsed, valid: parsed.valid && matched !== null}
}

type Token = {email: string, refresh_token: string, access_token: string, expires: Date}
type CallbackDependencies = {
  verifyState: (state: string) => GoogleState | null
  currentUser: () => Promise<{id: number} | null>
  findSite: (siteId: number) => Promise<{id: number, domain: string} | null>
  canManage: (userId: number, domain: string) => Promise<boolean>
  exchange: (code: string, siteId: number) => Promise<Token>
  save: (siteId: number, userId: number, token: Token) => Promise<void>
}

export async function googleOAuthCallback(request: Request, dependencies: CallbackDependencies) {
  const url = new URL(request.url)
  const state = dependencies.verifyState(url.searchParams.get("state") || "")
  const user = await dependencies.currentUser()
  if (!user) return Response.redirect(new URL("/login", url.origin), 302)
  const fallback = new URL("/", url.origin)
  const site = state ? await dependencies.findSite(state.siteId) : null
  // Neither a supplied domain nor an invalid signature may choose the destination.
  if (!site || !await dependencies.canManage(user.id, site.domain)) {
    fallback.searchParams.set("gsc", "expired")
    return Response.redirect(fallback, 302)
  }
  const destination = new URL(`/sites/${encodeURIComponent(site.domain)}/settings`, url.origin)
  destination.searchParams.set("tab", "integrations")
  const fail = (issue: GoogleOAuthIssue) => {
    destination.searchParams.set("gsc", issue)
    return Response.redirect(destination, 302)
  }
  if (!state?.valid || state.userId !== user.id) return fail("expired")
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "denied" : "failed")
  const code = url.searchParams.get("code")
  if (!code) return fail("failed")
  try {
    const token = await dependencies.exchange(code, site.id)
    await dependencies.save(site.id, user.id, token)
    return Response.redirect(destination, 302)
  } catch (error) {
    return fail(error instanceof KeywordRequestError && error.code === "auth_error" ? "auth_error" : "failed")
  }
}
