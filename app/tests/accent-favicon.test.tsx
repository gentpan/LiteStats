import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { renderToStaticMarkup } from "react-dom/server"
import { BrandMark, LogoMark } from "../src/components/BrandMark"
import geometry from "../src/assets/brand.json"
import { ACCENT_BOOTSTRAP_SCRIPT, ACCENT_FAVICON_BOOTSTRAP_SCRIPT, syncAccentFavicon, type AccentColor } from "../src/lib/accent-preference"

const variants: ReadonlyArray<readonly [AccentColor, string, string]> = [
  ["purple", "/favicon.svg?v=5", "#4f46e5"],
  ["blue", "/favicon-blue.svg?v=5", "#2563eb"],
  ["green", "/favicon-green.svg?v=5", "#15803d"],
  ["black", "/favicon-black.svg?v=5", "#27272a"],
]

function faviconFixture(initial = "/favicon.svg?v=5") {
  let href = initial
  const writes: string[] = []
  return {
    writes,
    get href() { return href },
    getAttribute: (name: string) => name === "href" ? href : null,
    setAttribute: (name: string, value: string) => { if (name === "href") { href = value; writes.push(value) } },
  }
}

test("favicon bootstrap follows the restored color before hydration and avoids duplicate writes", () => {
  for (const [accent, expected] of variants) {
    const dataset: Record<string, string> = { theme: "dark", siteLayout: "grid" }
    const favicon = faviconFixture()
    const ids: string[] = []
    const context = {
      document: { documentElement: { dataset }, getElementById: (id: string) => { ids.push(id); return id === "app-favicon" ? favicon : null } },
      localStorage: { getItem: () => accent },
    }
    runInNewContext(ACCENT_BOOTSTRAP_SCRIPT, context)
    runInNewContext(ACCENT_FAVICON_BOOTSTRAP_SCRIPT, context)
    runInNewContext(ACCENT_FAVICON_BOOTSTRAP_SCRIPT, context)
    expect(favicon.href).toBe(expected)
    expect(favicon.writes).toHaveLength(accent === "purple" ? 0 : 1)
    expect(ids).toEqual(["app-favicon", "app-favicon"])
    expect(dataset).toEqual({ theme: "dark", siteLayout: "grid", accent })
  }
})

test("favicon bootstrap uses fixed local paths for invalid preferences and tolerates unavailable storage or a missing icon", () => {
  for (const accent of [undefined, "", "navy", "__proto__", "constructor", "https://attacker.invalid/icon.svg", '</script><script>alert(1)</script>']) {
    const favicon = faviconFixture("/favicon-green.svg?v=5")
    runInNewContext(ACCENT_FAVICON_BOOTSTRAP_SCRIPT, {
      document: { documentElement: { dataset: { accent } }, getElementById: () => favicon },
      get localStorage() { throw new Error("Storage unavailable") },
    })
    expect(favicon.href).toBe("/favicon.svg?v=5")
  }
  expect(() => runInNewContext(ACCENT_FAVICON_BOOTSTRAP_SCRIPT, {
    document: { documentElement: { dataset: { accent: "blue" } }, getElementById: () => null },
  })).not.toThrow()

  const dataset: Record<string, string> = {}
  const favicon = faviconFixture("/favicon-green.svg?v=5")
  const context = {
    document: { documentElement: { dataset }, getElementById: () => favicon },
    get localStorage() { throw new Error("Storage unavailable") },
  }
  runInNewContext(ACCENT_BOOTSTRAP_SCRIPT, context)
  runInNewContext(ACCENT_FAVICON_BOOTSTRAP_SCRIPT, context)
  expect(dataset.accent).toBe("purple")
  expect(favicon.href).toBe("/favicon.svg?v=5")
})

test("runtime favicon synchronization is idempotent, accepts only known colors, and tolerates an absent link", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document")
  const dataset = { accent: "green", theme: "dark" }
  const favicon = faviconFixture()
  let present = true
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      documentElement: { dataset },
      getElementById: (id: string) => present && id === "app-favicon" ? favicon : null,
    } })
    syncAccentFavicon()
    expect(favicon.href).toBe("/favicon-green.svg?v=5")
    for (const [accent, expected] of variants) {
      syncAccentFavicon(accent)
      const writes = favicon.writes.length
      syncAccentFavicon(accent)
      expect(favicon.href).toBe(expected)
      expect(favicon.writes).toHaveLength(writes)
    }
    for (const invalid of ["__proto__", "constructor", "../private", "https://attacker.invalid/icon.svg"]) {
      syncAccentFavicon(invalid as AccentColor)
      expect(favicon.href).toBe("/favicon.svg?v=5")
    }
    present = false
    expect(() => syncAccentFavicon("blue")).not.toThrow()
    expect(dataset).toEqual({ accent: "green", theme: "dark" })
    Reflect.deleteProperty(globalThis, "document")
    expect(() => syncAccentFavicon()).not.toThrow()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor)
    else Reflect.deleteProperty(globalThis, "document")
  }
})

test("all favicon variants use the supplied Plost geometry and preserve the mark counter", () => {
  const base = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8")
  const mark = renderToStaticMarkup(<LogoMark />)
  const brand = renderToStaticMarkup(<BrandMark />)
  expect(brand).toContain('aria-label="Plost"')
  expect(geometry.letters.map(letter => letter.key).join("")).toBe("plost")
  expect(mark).toContain(geometry.mark_d)
  for (const letter of geometry.letters) {
    expect(brand).toContain(letter.d)
  }
  expect(brand.split(geometry.mark_d)).toHaveLength(2)
  expect(brand.match(/fill-rule="evenodd"/g)).toHaveLength(2)
  for (const [, path, color] of variants) {
    const svg = readFileSync(new URL(`../public${path.split("?")[0]}`, import.meta.url), "utf8")
    expect(svg).toBe(base.replace("#4f46e5", color))
    expect(svg).toContain(`viewBox="${geometry.mark_bb.map(value => value.toFixed(3)).join(' ')}"`)
    expect(svg).toContain(geometry.mark_d)
    expect(svg).toContain('fill-rule="evenodd"')
  }
})


test("the single soft-square O lands exactly in its wordmark slot at any badge size", () => {
  const letter = geometry.letters.find(letter => letter.key === "o")!
  const [vx, vy, vw, vh] = geometry.vb
  const [left, top, right, bottom] = letter.bbox
  const targetX = .5 - geometry.css.wm_w / 2 + ((left + right) / 2 - vx) / vw * geometry.css.wm_w
  const targetY = .5 - geometry.css.wm_h / 2 + ((top + bottom) / 2 - vy) / vh * geometry.css.wm_h
  expect(geometry.mark_d.match(/M/g)).toHaveLength(2)
  for (const size of [16, 40, 48, 56, 64, 160]) {
    expect((.5 + geometry.css.tx) * size).toBeCloseTo(targetX * size, 7)
    expect((.5 + geometry.css.ty) * size).toBeCloseTo(targetY * size, 7)
    expect(geometry.css.mk_w * geometry.css.k * size).toBeCloseTo((right - left) / vw * geometry.css.wm_w * size, 7)
  }
})
