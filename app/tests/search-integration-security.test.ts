import { expect, test } from "bun:test"
import { createSearchIntegrationHandlers, googleReauthorizationValues, openSearchSecret, searchResourceMatchesSite, sealSearchSecret } from "../src/lib/search-integration-security"

const secret = "fixture-secret-never-public", key = "fixture-encryption-key"

test("new search credentials are authenticated ciphertext bound to the site, provider and field", () => {
  const encrypted = sealSearchSecret(secret, 7, "bing:api_key", key)
  expect(encrypted).toStartWith("litestats-secret:v1:")
  expect(encrypted).not.toContain(secret)
  expect(encrypted).not.toBe(sealSearchSecret(secret, 7, "bing:api_key", key))
  expect(openSearchSecret(encrypted, 7, "bing:api_key", key)).toBe(secret)
  for (const [siteId, field, encryptionKey] of [[8, "bing:api_key", key], [7, "google:access_token", key], [7, "google:refresh_token", key], [7, "bing:api_key", "rotated-key"]] as const) {
    expect(() => openSearchSecret(encrypted, siteId, field, encryptionKey)).toThrow("搜索平台密钥无法读取")
  }
  const parts = encrypted.split(":")
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1)
  expect(() => openSearchSecret(parts.join(":"), 7, "bing:api_key", key)).toThrow("搜索平台密钥无法读取")
  expect(() => openSearchSecret("litestats-secret:v2:invalid", 7, "bing:api_key", key)).toThrow()
})

test("legacy plaintext credentials remain readable without conversion or writes", () => {
  expect(openSearchSecret(secret, 7, "bing:api_key", key)).toBe(secret)
  expect(openSearchSecret(secret, 7, "google:access_token", key)).toBe(secret)
  expect(openSearchSecret("", 7, "google:refresh_token", key)).toBe("")
  expect(sealSearchSecret("", 7, "google:refresh_token", key)).toBe("")
})

test("resources match only the actual site or its www alias and preserve legitimate URL prefixes", () => {
  for (const resource of ["sc-domain:example.com", "sc-domain:www.example.com", "https://example.com/", "https://www.example.com/docs/", "http://example.com/blog/"]) {
    expect(searchResourceMatchesSite(resource, "example.com", "google")).toBe(true)
  }
  for (const resource of ["https://example.com/", "https://www.example.com/docs/", "http://example.com/blog/"]) {
    expect(searchResourceMatchesSite(resource, "www.example.com", "bing")).toBe(true)
  }
  for (const resource of ["https://example.com.evil.test/", "https://other.com/", "sc-domain:other.com", "https://example.com@other.com/", "https://user:secret@example.com/", "https://example.com/?apiKey=secret", "https://example.com/#token", "https://example.com:8443/", "javascript:alert(1)", "", "sc-domain:example.com/path"]) {
    expect(searchResourceMatchesSite(resource, "example.com", "google")).toBe(false)
  }
  expect(searchResourceMatchesSite("sc-domain:example.com", "blog.example.com", "google")).toBe(false)
  expect(searchResourceMatchesSite("https://example.com/", "blog.example.com", "bing")).toBe(false)
  expect(searchResourceMatchesSite("https://store.example.com/", "blog.example.com", "google")).toBe(false)
  expect(searchResourceMatchesSite("https://xn--fsqu00a.xn--fiqs8s/", "例子.中国", "google")).toBe(true)
})

test("Google account switches cannot inherit a different account's refresh token or selected resource", () => {
  const previous = {email: "first@example.test", refresh_token: "old-refresh", property: "sc-domain:example.com"}
  expect(googleReauthorizationValues(previous, {email: "second@example.test", refresh_token: ""}, "example.com")).toEqual({refresh_token: "", property: null})
  expect(googleReauthorizationValues(previous, {email: "second@example.test", refresh_token: "new-refresh"}, "example.com")).toEqual({refresh_token: "new-refresh", property: null})
  expect(googleReauthorizationValues(previous, {email: "FIRST@example.test", refresh_token: ""}, "example.com")).toEqual({refresh_token: "old-refresh", property: previous.property})
  expect(googleReauthorizationValues({...previous, property: "https://other.com/"}, {email: previous.email, refresh_token: "new-refresh"}, "example.com")).toEqual({refresh_token: "new-refresh", property: null})
  expect(googleReauthorizationValues(null, {email: previous.email, refresh_token: "new-refresh", property: "https://example.com/docs/"}, "example.com")).toEqual({refresh_token: "new-refresh", property: "https://example.com/docs/"})
})

function fixture(role = "owner", member = true, signedIn = true, propertiesAvailable = true) {
  const writes: unknown[][] = [], access: string[] = []
  const handlers = createSearchIntegrationHandlers({
    user: async () => {if (!signedIn) throw new Error("UNAUTH"); return {id: 1}},
    site: async (_user, _domain, level) => {access.push(level); return member && ["owner", "admin"].includes(role) ? {id: 7, domain: "example.com"} : null},
    saveBing: async (...values) => {writes.push(["bing", ...values])},
    removeBing: async (...values) => {writes.push(["remove-bing", ...values])},
    googleProperties: async () => {if (!propertiesAvailable) throw new Error("provider-error-with-secret"); return ["https://example.com/", "https://www.example.com/docs/"]},
    saveGoogleProperty: async (...values) => {writes.push(["google", ...values])},
    removeGoogle: async (...values) => {writes.push(["remove-google", ...values])},
  })
  return {handlers, writes, access}
}

test("editor, guest, viewer, non-member and signed-out requests cannot change or remove integrations", async () => {
  for (const [role, member, signedIn] of [["editor", true, true], ["guest", true, true], ["viewer", true, true], ["admin", false, true], ["owner", true, false]] as const) {
    const {handlers, writes} = fixture(role, member, signedIn)
    await expect(handlers.saveBing({domain: "example.com", apiKey: secret, siteUrl: "https://example.com/"})).rejects.toThrow()
    await expect(handlers.removeBing({domain: "example.com"})).rejects.toThrow()
    await expect(handlers.saveGoogleProperty({domain: "example.com", property: "https://example.com/"})).rejects.toThrow()
    await expect(handlers.removeGoogle({domain: "example.com"})).rejects.toThrow()
    expect(writes).toEqual([])
  }
})

test("admin integration saves reject foreign sites, unverified properties and malformed keys before persistence", async () => {
  const {handlers, writes, access} = fixture("admin")
  await expect(handlers.saveBing({domain: "example.com", apiKey: secret, siteUrl: "https://other.com/"})).rejects.toThrow("本站域名")
  await expect(handlers.saveBing({domain: "example.com", apiKey: "bad\nkey", siteUrl: "https://example.com/"})).rejects.toThrow("Bing API Key")
  await expect(handlers.saveGoogleProperty({domain: "example.com", property: "https://other.com/"})).rejects.toThrow("本站域名")
  await expect(handlers.saveGoogleProperty({domain: "example.com", property: "https://example.com/unverified/"})).rejects.toThrow("访问权限")
  expect(writes).toEqual([])
  expect(await handlers.saveBing({domain: "example.com", apiKey: secret, siteUrl: "https://www.example.com/"})).toEqual({ok: true})
  expect(await handlers.saveGoogleProperty({domain: "example.com", property: "https://www.example.com/docs/"})).toEqual({ok: true})
  expect(writes).toEqual([["bing", 7, secret, "https://www.example.com/"], ["google", 7, "https://www.example.com/docs/"]])
  expect(access.every(level => level === "admin")).toBe(true)
})

test("property verification failures remain actionable without exposing raw provider errors", async () => {
  const {handlers, writes} = fixture("owner", true, true, false)
  await expect(handlers.saveGoogleProperty({domain: "example.com", property: "https://example.com/"})).rejects.toThrow("暂时无法核实 Google 资源")
  expect(writes).toEqual([])
})
