import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { CountryFlag } from "../src/components/icons"

test("square and rectangular flag rendering resolve to retained assets after deduplication", () => {
  const publicRoot = new URL("../public/", import.meta.url)
  const missing: string[] = []
  for (const file of readdirSync(new URL("flags/", publicRoot))) {
    if (!file.endsWith(".svg")) continue
    for (const shape of ["square", "rect"] as const) {
      const html = renderToStaticMarkup(<CountryFlag code={file.slice(0, -4)} shape={shape} />)
      const src = html.match(/<img[^>]*\bsrc="([^"]+)"/)?.[1]
      if (!src || !existsSync(new URL(src.slice(1), publicRoot))) missing.push(`${file}:${shape}`)
    }
  }
  expect(missing).toEqual([])
  expect(readdirSync(new URL("images/flags/4x3/", publicRoot))).toEqual(["tw.svg"])
  expect(readFileSync(new URL("flags/tw.svg", publicRoot)).equals(readFileSync(new URL("images/flags/4x3/tw.svg", publicRoot)))).toBe(true)
  for (const [path, viewBox] of [
    ["images/flags/1x1/tw.svg", "0 0 512 512"],
    ["images/flags/4x3/tw.svg", "0 0 640 480"],
    ["flags/tw.svg", "0 0 640 480"],
  ] as const) {
    const root = readFileSync(new URL(path, publicRoot), "utf8").match(/^<svg\b[^>]*>/)?.[0]
    expect(root).toContain('id="flag-icons-tw"')
    expect(root).toContain(`viewBox="${viewBox}"`)
  }
})
