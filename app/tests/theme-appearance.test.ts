import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { rootAppearancePreferences, themeBootstrapScript } from "../src/lib/theme-appearance"

test("root appearance returns only normalized public preferences from the current account", () => {
  const user = {
    locale: "en",
    theme: "dark",
    email: "private-account@example.invalid",
    password_hash: "private-password-hash",
    totp_secret: "private-second-factor-secret",
    name: '</script><script>alert("private-name")</script>',
  }
  const preferences = rootAppearancePreferences(user, "zh-CN")
  expect(preferences).toEqual({ locale: "en", theme: "dark" })
  expect(Object.keys(preferences)).toEqual(["locale", "theme"])
  const serialized = JSON.stringify(preferences) + themeBootstrapScript(preferences.theme)
  for (const privateValue of [user.email, user.password_hash, user.totp_secret, user.name]) {
    expect(serialized).not.toContain(privateValue)
  }
  expect(rootAppearancePreferences({ locale: "zh-CN", theme: "light" }, "en"))
    .toEqual({ locale: "zh-CN", theme: "light" })
})

test("anonymous and invalid account preferences retain the locale-cookie fallback and system theme", () => {
  expect(rootAppearancePreferences(null, "en")).toEqual({ locale: "en", theme: "system" })
  expect(rootAppearancePreferences(null, undefined)).toEqual({ locale: "zh-CN", theme: "system" })
  for (const value of [null, undefined, "", "Dark", "invalid", '__proto__', '</script><script>alert(1)</script>']) {
    expect(rootAppearancePreferences({ theme: value, locale: value }, "en"))
      .toEqual({ locale: "en", theme: "system" })
    expect(rootAppearancePreferences({ theme: value, locale: value }, value))
      .toEqual({ locale: "zh-CN", theme: "system" })
  }
})

test("explicit light and dark paint independently of the system theme without querying browser media", () => {
  for (const theme of ["light", "dark"] as const) {
    const dataset = { theme: theme === "dark" ? "light" : "dark", accent: "green", siteLayout: "grid" }
    runInNewContext(themeBootstrapScript(theme), {
      document: { documentElement: { dataset } },
      window: { matchMedia: () => { throw new Error("An explicit preference must not query system appearance") } },
    })
    expect(dataset).toEqual({ theme, accent: "green", siteLayout: "grid" })
  }
})

test("system appearance resolves before hydration and preserves unrelated saved presentation", () => {
  for (const matches of [false, true]) {
    const dataset = { theme: "light", accent: "black", siteLayout: "list" }
    const mediaQueries: string[] = []
    runInNewContext(themeBootstrapScript("system"), {
      document: { documentElement: { dataset } },
      window: { matchMedia: (query: string) => { mediaQueries.push(query); return { matches } } },
    })
    expect(mediaQueries).toEqual(["(prefers-color-scheme: dark)"])
    expect(dataset).toEqual({ theme: matches ? "dark" : "light", accent: "black", siteLayout: "list" })
  }
})

test("missing, blocked, and malformed media APIs safely retain the light fallback", () => {
  for (const browser of [
    {},
    { matchMedia: undefined },
    { matchMedia: () => { throw new Error("Blocked media API") } },
    { matchMedia: () => null },
    { get matchMedia() { throw new Error("Blocked media access") } },
  ]) {
    const dataset = { theme: "dark", accent: "blue", siteLayout: "grid" }
    expect(() => runInNewContext(themeBootstrapScript("system"), {
      document: { documentElement: { dataset } }, window: browser,
    })).not.toThrow()
    expect(dataset).toEqual({ theme: "light", accent: "blue", siteLayout: "grid" })
  }
})

test("untrusted theme values cannot add markup or JavaScript to the early script", () => {
  for (const value of [null, undefined, {}, [], 1, "Dark", '__proto__', '</script><script>alert(1)</script>', 'dark";alert(1)//']) {
    const script = themeBootstrapScript(value)
    expect(script).toBe(themeBootstrapScript("system"))
    expect(script).not.toContain("</script>")
    expect(script).not.toContain("alert(")
    const dataset: Record<string, string> = {}
    runInNewContext(script, {
      document: { documentElement: { dataset } },
      window: { matchMedia: () => ({ matches: true }) },
    })
    expect(dataset.theme).toBe("dark")
  }
})
