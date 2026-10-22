import { expect, test } from "bun:test"
import { consumeGoogleState, createGoogleState, googleOAuthCallback, googleStateCookieName, parseGoogleState } from "../src/lib/google-oauth-flow"
import { KeywordRequestError } from "../src/lib/keyword-report"
import { createHmac } from "node:crypto"

const key = "oauth-unit-test-key"
const now = Date.UTC(2026, 9, 22)

test("Google state rejects tampering and preserves only a signed site for expired destinations", () => {
  const state = createGoogleState(42, 7, key, now)
  expect(parseGoogleState(state, key, now)).toEqual({siteId: 42, userId: 7, valid: true})
  expect(parseGoogleState(state, key, now + 600_000)).toEqual({siteId: 42, userId: 7, valid: false})
  expect(parseGoogleState(state, "wrong-key", now)).toBeNull()
  expect(parseGoogleState(state + ".extra", key, now)).toBeNull()
  expect(parseGoogleState("unsigned.payload", key, now)).toBeNull()
  const changedPayload = Buffer.from(JSON.stringify({siteId: 99, exp: now + 1_000})).toString("base64url")
  expect(parseGoogleState(`${changedPayload}.${state.split(".")[1]}`, key, now)).toBeNull()
  for (const id of [-1, 0, 1.5, Infinity]) expect(parseGoogleState(createGoogleState(id, 7, key, now), key, now)).toBeNull()
  expect(createGoogleState(42, 7, key, now)).not.toBe(state)
})

test("different site authorizations coexist, are one-use, and require the matching cookie", () => {
  const a = createGoogleState(1, 7, key, now), b = createGoogleState(2, 7, key, now)
  const values = new Map([[googleStateCookieName(1), a], [googleStateCookieName(2), b]])
  const cookies = {get: (name: string) => values.get(name), delete: (name: string) => {values.delete(name)}}
  expect(consumeGoogleState(a, key, cookies, now)).toEqual({siteId: 1, userId: 7, valid: true})
  expect(values.get(googleStateCookieName(2))).toBe(b)
  expect(consumeGoogleState(a, key, cookies, now)).toEqual({siteId: 1, userId: 7, valid: false})
  expect(consumeGoogleState(b, key, cookies, now)).toEqual({siteId: 2, userId: 7, valid: true})
  const later = createGoogleState(1, 7, key, now)
  values.set(googleStateCookieName(1), later)
  expect(consumeGoogleState(a, key, cookies, now)?.valid).toBe(false)
  expect(values.get(googleStateCookieName(1))).toBe(later)
})

test("in-flight legacy state cookies remain accepted and expired cookies never authorize", () => {
  const state = createGoogleState(1, 7, key, now)
  const values = new Map([["litestats_gsc_state", state]])
  const cookies = {get: (name: string) => values.get(name), delete: (name: string) => {values.delete(name)}}
  expect(consumeGoogleState(state, key, cookies, now)?.valid).toBe(true)
  expect(values.size).toBe(0)
  values.set(googleStateCookieName(1), state)
  expect(consumeGoogleState(state, key, cookies, now + 600_000)?.valid).toBe(false)
  expect(values.size).toBe(0)
})

test("old state without an initiating user can only identify a recovery destination", () => {
  const payload = Buffer.from(JSON.stringify({siteId: 1, nonce: "a".repeat(48), exp: now + 600_000})).toString("base64url")
  const state = `${payload}.${createHmac("sha256", key).update(`gsc:${payload}`).digest("hex")}`
  const cookies = {get: () => state, delete: () => {}}
  expect(consumeGoogleState(state, key, cookies, now)).toEqual({siteId: 1, userId: null, valid: false})
})

function fixture() {
  const calls: unknown[][] = []
  const token = {email: "fixture@example.test", access_token: "fixture-access", refresh_token: "fixture-refresh", expires: new Date(now + 3600_000)}
  const dependencies: Parameters<typeof googleOAuthCallback>[1] = {
    verifyState: () => ({siteId: 42, userId: 7, valid: true}),
    currentUser: async () => ({id: 7}),
    findSite: async siteId => ({id: siteId, domain: "example.test"}),
    canManage: async (userId, domain) => {calls.push(["manage", userId, domain]); return true},
    exchange: async (code, siteId) => {calls.push(["exchange", code, siteId]); return token},
    save: async (siteId, userId, received) => {calls.push(["save", siteId, userId, received])},
  }
  const run = async (query = "code=fixture-code&state=fixture-state") => {
    const response = await googleOAuthCallback(new Request(`https://stats.example.test/api/auth/google?${query}`), dependencies)
    expect(response.status).toBe(302)
    return new URL(response.headers.get("location")!)
  }
  return {calls, token, dependencies, run}
}

test("authorized OAuth success stores tokens then returns to the same site's integrations", async () => {
  const {run, calls, token} = fixture()
  const url = await run()
  expect(url.href).toBe("https://stats.example.test/sites/example.test/settings?tab=integrations")
  expect(calls).toEqual([["manage", 7, "example.test"], ["exchange", "fixture-code", 42], ["save", 42, 7, token]])
})

test("declined authorization returns a clear issue without attempting exchange", async () => {
  const {run, calls} = fixture()
  const url = await run("error=access_denied&error_description=secret-provider-text&state=fixture-state")
  expect(url.pathname).toBe("/sites/example.test/settings")
  expect(url.searchParams.get("gsc")).toBe("denied")
  expect(url.href).not.toContain("secret-provider-text")
  expect(calls.map(call => call[0])).toEqual(["manage"])
})

test("expired or missing cookie state cannot exchange a code but can safely explain the failure", async () => {
  const {run, calls, dependencies} = fixture()
  dependencies.verifyState = () => ({siteId: 42, userId: 7, valid: false})
  const url = await run()
  expect(url.pathname).toBe("/sites/example.test/settings")
  expect(url.searchParams.get("gsc")).toBe("expired")
  expect(calls.map(call => call[0])).toEqual(["manage"])
})

test("changing the logged-in account during authorization cannot attach the first account's Google grant", async () => {
  const {run, calls, dependencies} = fixture()
  dependencies.verifyState = () => ({siteId: 42, userId: 99, valid: true})
  const url = await run()
  expect(url.searchParams.get("gsc")).toBe("expired")
  expect(calls.map(call => call[0])).toEqual(["manage"])
})

test("invalid signatures, absent sites and non-admin users cannot exchange or choose a site redirect", async () => {
  for (const condition of ["signature", "site", "permission"]) {
    const {run, calls, dependencies} = fixture()
    if (condition === "signature") dependencies.verifyState = () => null
    if (condition === "site") dependencies.findSite = async () => null
    if (condition === "permission") dependencies.canManage = async () => false
    const url = await run("code=fixture-code&state=fixture-state&domain=other.test&redirect=https://outside.test")
    expect(url.origin).toBe("https://stats.example.test")
    expect(url.pathname).toBe("/dashboard")
    expect(url.searchParams.get("gsc")).toBe("expired")
    expect(calls).toEqual([])
  }
  const {run, calls, dependencies} = fixture()
  dependencies.currentUser = async () => null
  expect((await run()).pathname).toBe("/login")
  expect(calls).toEqual([])
})

test("provider exchange and persistence failures return bounded issue codes, never raw errors or tokens", async () => {
  for (const error of [new KeywordRequestError("auth_error"), new KeywordRequestError("request_timeout"), new Error("secret-access-token")]) {
    const {run, calls, dependencies} = fixture()
    dependencies.exchange = async () => {throw error}
    const url = await run()
    expect(url.pathname).toBe("/sites/example.test/settings")
    expect(url.searchParams.get("gsc")).toBe(error instanceof KeywordRequestError && error.code === "auth_error" ? "auth_error" : "failed")
    expect(url.href).not.toContain("secret")
    expect(calls.map(call => call[0])).toEqual(["manage"])
  }
  const {run, dependencies} = fixture()
  dependencies.save = async () => {throw new Error("private-database-detail")}
  expect((await run()).searchParams.get("gsc")).toBe("failed")
})

test("missing authorization codes and unknown provider errors return a useful failure without exchange", async () => {
  for (const query of ["state=fixture-state", "state=fixture-state&error=server_error"]) {
    const {run, calls} = fixture()
    expect((await run(query)).searchParams.get("gsc")).toBe("failed")
    expect(calls.map(call => call[0])).toEqual(["manage"])
  }
})
