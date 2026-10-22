import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { RowIcon } from "../src/components/icons"
import { isDirectSource, sourceIconSrc } from "../src/lib/source-icons"

const publicRoot = new URL("../public/", import.meta.url)
const sourceRoot = new URL("brands/sources/", publicRoot)

function render(name: string) {
  const html = renderToStaticMarkup(<RowIcon kind="source" name={name} />)
  return { html, src: html.match(/<img[^>]*\bsrc="([^"]+)"/)?.[1] }
}

test("common source labels and actual referrer hosts select the same bundled brand", () => {
  const cases: [string[], string][] = [
    [["X", "Twitter", "X (Twitter)", " x (TWITTER) ", "x.com", "mobile.twitter.com", "t.co"], "x-formerly-twitter-light"],
    [["Weibo", "微博", "weibo.com", "m.weibo.cn", "t.cn"], "sina-weibo"],
    [["GitHub", " github ", "GITHUB", "github.com", "www.github.com/path", "github.com:443/project", "https://WWW.GITHUB.COM.:443/docs?q=1#part"], "github"],
    [["Google", "google.com", "www.google.co.uk", "https://www.google.com/search?q=stats"], "google"],
    [["Bing", "Bing Images", "bing.com", "cn.bing.com"], "bing"],
    [["Baidu", "baidu.com", "m.baidu.com"], "baidu"],
    [["Facebook", "facebook.com", "m.facebook.com", "l.facebook.com"], "facebook"],
    [["Instagram", "instagram.com", "l.instagram.com"], "instagram"],
    [["LinkedIn", "linkedin.com", "lnkd.in"], "linkedin"],
    [["Reddit", "reddit.com", "old.reddit.com", "redd.it"], "reddit"],
    [["Youtube", "YouTube", "youtube.com", "youtu.be"], "youtube"],
    [["Hacker News", "news.ycombinator.com"], "y-combinator"],
    [["StackOverflow", "Stack Overflow", "stackoverflow.com"], "stack-overflow"],
    [["Telegram", "web.telegram.org", "t.me"], "telegram"],
    [["Discord", "discord.com", "discord.gg"], "discord"],
    [["WeChat", "微信", "weixin.qq.com"], "wechat"],
  ]
  for (const [names, slug] of cases) {
    const expected = `/brands/sources/${slug}.svg`
    expect(existsSync(new URL(expected.slice(1), publicRoot))).toBe(true)
    for (const name of names) {
      expect(sourceIconSrc(name)).toBe(expected)
      const { html, src } = render(name)
      expect(src).toBe(expected)
      expect(html).toContain("h-4 w-4 shrink-0 object-contain")
      expect(html).not.toContain("/favicon/sources/")
      expect(html).not.toContain("thesvg.org")
    }
  }
})

test("AI products use their own artwork before a broad parent-company domain", () => {
  const groups = [
    ["ChatGPT", "chatgpt.com", "chat.openai.com", "https://chatgpt.com/c/example"],
    ["Claude", "claude.ai", "https://claude.ai/chat/example"],
    ["Perplexity", "perplexity.ai", "www.perplexity.ai"],
    ["Gemini", "gemini.google.com", "https://gemini.google.com/app"],
    ["DeepSeek", "deepseek.com", "chat.deepseek.com"],
    ["Copilot", "copilot.microsoft.com", "https://copilot.microsoft.com/"],
  ]
  for (const [label, ...aliases] of groups) {
    const src = sourceIconSrc(label)
    expect(src).toMatch(/^\/brands\/sources\/[^/]+\.svg$/)
    expect(existsSync(new URL(src!.slice(1), publicRoot))).toBe(true)
    for (const name of [label, `  ${label.toUpperCase()}  `, ...aliases]) {
      expect(sourceIconSrc(name)).toBe(src)
      expect(render(name).src).toBe(src)
    }
  }
  expect(sourceIconSrc("gemini.google.com")).not.toBe(sourceIconSrc("google.com"))
  expect(sourceIconSrc("GitHub Copilot")).toBe("/brands/sources/github-copilot-light.svg")
  expect(sourceIconSrc("GitHub Copilot")).not.toBe(sourceIconSrc("Copilot"))
})

test("brand matching requires a hostname boundary and rejects malformed or ambiguous input", () => {
  for (const name of [
    "github.com.evil", "notgithub.com", "x.com.evil", "notx.com", "evilgithub.com",
    "https://evil.com/?next=https://github.com", "https://github.com@evil.com/",
    "https://user:secret@github.com/", "https://user@github.com/",
    "javascript:github.com", "ftp://github.com", "file:///github.com",
    "https://github.com:bad/", "https://", "github.com\\evil.com", "github.com\n.evil",
    "__proto__", "constructor", "toString", "hasOwnProperty", "%", "%25", "%ZZ",
    "unknown-source", "traffic.gentpan.dev", "GitHub newsletter", "github.io", "ycombinator.com",
  ]) expect(sourceIconSrc(name)).toBeUndefined()
})

test("unknown sources retain the encoded favicon route and direct aliases use the pointer icon", () => {
  for (const name of ["traffic.gentpan.dev", "https://stats.gentpan.dev/docs?source=one", "unknown source"]) {
    const { html, src } = render(name)
    expect(sourceIconSrc(name)).toBeUndefined()
    expect(src).toBe(`/favicon/sources/${encodeURIComponent(name)}`)
    expect(html).not.toContain("/brands/sources/")
  }
  for (const name of ["", "  ", "Direct", " direct ", "DIRECT", "Direct / None", "DIRECT / NONE", "direct/none", "(none)", "(NONE)"]) {
    const { html, src } = render(name)
    expect(sourceIconSrc(name)).toBeUndefined()
    expect(src).toBeUndefined()
    expect(isDirectSource(name)).toBe(true)
    expect(html).toContain("fa-arrow-pointer")
    expect(html).not.toContain("fa-link")
    expect(html).not.toContain("/favicon/sources/")
  }
})

test("direct-source detection is exact and does not swallow real referrer domains or campaigns", () => {
  for (const name of ["Direct", " direct ", "DIRECT", "", " \t ", "Direct / None", "direct/none", "DIRECT  /  NONE", "(none)", "(NONE)"]) {
    expect(isDirectSource(name)).toBe(true)
  }
  for (const name of [
    "direct.com", "www.direct.com", "direct.cn", "direct.none", "direct/none/path",
    "https://direct.com", "https://direct.com/none", "direct.com?source=none",
    "directly", "Direct newsletter", "Direct traffic", "none", "(none).com",
    "Yandex.Direct", "yandex.direct", "Google", "referrer.direct.example",
  ]) {
    expect(isDirectSource(name)).toBe(false)
    expect(render(name).html).not.toContain("fa-arrow-pointer")
  }
  expect(render("direct.com").src).toBe("/favicon/sources/direct.com")
  expect(render("https://direct.com").src).toBe("/favicon/sources/https%3A%2F%2Fdirect.com")
})

test("bundled source SVGs are self-contained and retain pinned provenance", () => {
  const manifest = JSON.parse(readFileSync(new URL("sources.json", sourceRoot), "utf8"))
  expect(manifest.repository).toBe("https://github.com/glincker/thesvg")
  expect(manifest.commit).toMatch(/^[a-f0-9]{40}$/)
  const files = readdirSync(sourceRoot).filter(file => file.endsWith(".svg"))
  expect(files.length).toBeGreaterThan(0)
  expect(files.sort()).toEqual(manifest.assets.map((asset: {file: string}) => asset.file).sort())
  for (const asset of manifest.assets) {
    const bytes = readFileSync(new URL(asset.file, sourceRoot))
    const svg = bytes.toString("utf8")
    expect(asset.license.length).toBeGreaterThan(0)
    expect(asset.source).toContain(`/${manifest.commit}/public/icons/`)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256)
    expect(svg).toMatch(/<svg\b[^>]*viewBox=/)
    expect(svg).not.toMatch(/<script\b|<foreignObject\b|<image\b|<iframe\b|\bon\w+\s*=|<!DOCTYPE|<!ENTITY|javascript:|@import/i)
    for (const match of svg.matchAll(/(?:href|src)=["']([^"']*)/g)) expect(match[1]).toStartWith("#")
    for (const match of svg.matchAll(/url\(([^)]*)\)/g)) expect(match[1].replace(/["']/g, "").trim()).toStartWith("#")
  }
})
