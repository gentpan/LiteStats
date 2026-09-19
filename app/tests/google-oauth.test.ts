import { expect, test } from "bun:test"
import { googleOAuthSchema } from "../src/lib/google-oauth-settings"

const config = {clientId: "123-example.apps.googleusercontent.com", clientSecret: "test-secret", redirectUri: "https://stats.example.com/api/auth/google"}
test("Google OAuth accepts HTTPS callbacks and local development callbacks", () => {
  expect(googleOAuthSchema.safeParse(config).success).toBe(true)
  expect(googleOAuthSchema.safeParse({...config, redirectUri: "http://127.0.0.1:3100/api/auth/google"}).success).toBe(true)
  expect(googleOAuthSchema.safeParse({...config, clientSecret: ""}).success).toBe(true)
})
test("Google OAuth rejects invalid clients and unsafe or incorrect callback URLs", () => {
  expect(googleOAuthSchema.safeParse({...config, clientId: "invalid"}).success).toBe(false)
  for (const redirectUri of ["http://stats.example.com/api/auth/google", "https://stats.example.com/wrong", "https://stats.example.com/api/auth/google?x=1", "https://user:pass@stats.example.com/api/auth/google", "javascript:alert(1)"]) {
    expect(googleOAuthSchema.safeParse({...config, redirectUri}).success).toBe(false)
  }
})
