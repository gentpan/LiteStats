import { expect, test } from "bun:test"
import { decodeGoogleOAuthConfig, googleOAuthSchema, prepareGoogleOAuthConfig } from "../src/lib/google-oauth-settings"
import { sealSearchSecret } from "../src/lib/search-integration-security"
import { createCipheriv, createHash, randomBytes } from "node:crypto"

const config = {clientId: "123-example.apps.googleusercontent.com", clientSecret: "test-secret", redirectUri: "https://stats.example.com/api/auth/google"}
test("Google OAuth accepts HTTPS callbacks and local development callbacks", () => {
  expect(googleOAuthSchema.safeParse(config).success).toBe(true)
  expect(googleOAuthSchema.safeParse({...config, redirectUri: "http://127.0.0.1:3100/api/auth/google"}).success).toBe(true)
  expect(googleOAuthSchema.safeParse({...config, clientSecret: ""}).success).toBe(true)
})
test("Google OAuth rejects invalid clients and unsafe or incorrect callback URLs", () => {
  expect(googleOAuthSchema.safeParse({...config, clientId: "invalid"}).success).toBe(false)
  for (const redirectUri of ["", "not a url", "https://", "http://stats.example.com/api/auth/google", "https://stats.example.com/wrong", "https://stats.example.com/api/auth/google?x=1", "https://user:pass@stats.example.com/api/auth/google", "javascript:alert(1)"]) {
    expect(googleOAuthSchema.safeParse({...config, redirectUri}).success).toBe(false)
  }
})

test("Google client changes require a fresh matching secret and corrupt configurations can be replaced", () => {
  expect(prepareGoogleOAuthConfig({...config, clientSecret: ""}, config).clientSecret).toBe(config.clientSecret)
  expect(() => prepareGoogleOAuthConfig({...config, clientId: "456-other.apps.googleusercontent.com", clientSecret: ""}, config)).toThrow("Client Secret")
  expect(() => prepareGoogleOAuthConfig({...config, clientSecret: ""}, null)).toThrow("Client Secret")
  expect(prepareGoogleOAuthConfig(config, null)).toEqual(config)
})

test("new Google client settings are site-bound and old encrypted records stay readable without rewrites", () => {
  const key = "fixture-session-key"
  const encrypted = sealSearchSecret(JSON.stringify(config), 7, "google:client_config", key)
  expect(decodeGoogleOAuthConfig(encrypted, 7, key)).toEqual(config)
  expect(() => decodeGoogleOAuthConfig(encrypted, 8, key)).toThrow("Google OAuth 配置无法读取")
  expect(() => decodeGoogleOAuthConfig(encrypted, 7, "rotated-session-key")).toThrow("Google OAuth 配置无法读取")
  expect(() => decodeGoogleOAuthConfig("damaged-record", 7, key)).toThrow("Google OAuth 配置无法读取")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(`litestats-google-oauth:${key}`).digest(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()])
  const legacy = [iv, cipher.getAuthTag(), data].map(value => value.toString("base64")).join(":")
  expect(decodeGoogleOAuthConfig(legacy, 7, key)).toEqual(config)
})
