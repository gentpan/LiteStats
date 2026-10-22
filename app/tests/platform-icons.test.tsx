import { expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { RowIcon } from "../src/components/icons"

const publicRoot = new URL("../public/", import.meta.url)
function render(kind: "browser" | "os", name: string) {
  const html = renderToStaticMarkup(<RowIcon kind={kind} name={name}/>)
  return { html, src: html.match(/<img[^>]*\bsrc="([^"]+)"/)?.[1] }
}
function checkCases(kind: "browser" | "os", cases: [string[], string][]) {
  for (const [names, expected] of cases) {
    expect(existsSync(new URL(expected.slice(1), publicRoot))).toBe(true)
    for (const name of names) {
      const { html, src } = render(kind, name)
      expect(src).toBe(expected)
      expect(html).toContain("h-4 w-4 shrink-0 object-contain")
      expect(html).not.toContain("fa-brands")
    }
  }
}

test("browsers and version aliases keep their own original-color local artwork", () => {
  checkCases("browser", [
    [["Chrome", "Chrome 145", "Google Chrome", "Chrome Mobile", "Chrome Mobile iOS 26", "Chrome Headless/145"], "/brands/platforms/chrome.svg"],
    [["Chromium", "chromium 145"], "/brands/platforms/chromium.svg"],
    [["Safari", "Mobile Safari", "Safari Mobile 26"], "/brands/platforms/safari.svg"],
    [["Firefox", "Firefox Mobile", "Firefox iOS 144"], "/brands/platforms/firefox.svg"],
    [["Edge", "Microsoft Edge", "Edge Mobile 145"], "/brands/platforms/edge.svg"],
    [["Opera", "Opera Mini", "Opera Mobile 95"], "/brands/platforms/opera.svg"],
    [["Brave", "Brave Browser"], "/brands/platforms/brave-browser.svg"],
    [["Vivaldi"], "/brands/platforms/vivaldi.svg"],
    [["Internet Explorer", "IE 11"], "/brands/platforms/internetexplorer.svg"],
    [["Samsung Browser", "Samsung Internet"], "/brands/platforms/samsung-browser.svg"],
    [["DuckDuckGo", "DuckDuckGo Browser", "DuckDuckGo Privacy Browser"], "/brands/platforms/duckduckgo.svg"],
    [["curl/8.5"], "/brands/platforms/curl.svg"],
    [["Ecosia"], "/brands/platforms/ecosia.svg"],
    [["Yandex Browser"], "/images/icon/browser/yandex.png"],
    [["QQ Browser"], "/images/icon/browser/qq.png"],
    [["UC Browser"], "/images/icon/browser/uc.svg"],
    [["MIUI Browser"], "/images/icon/browser/miui.webp"],
    [["Huawei Browser", "Huawei Browser Mobile"], "/images/icon/browser/huawei.png"],
    [["vivo Browser"], "/images/icon/browser/vivo.png"],
  ])
})

test("OS versions select the correct family, while unknown names keep a generic 16px icon", () => {
  checkCases("os", [
    [["Windows", "Windows 10", "Windows10", "Windows XP", "Windows Vista", "Windows NT 10.0", "Windows Phone 8.1"], "/brands/platforms/windows.svg"],
    [["Windows 11", "Windows11", "Windows 11 24H2"], "/brands/platforms/windows11.svg"],
    [["Android", "Android 16"], "/brands/platforms/android.svg"],
    [["GNU/Linux", "Linux", "Linux 6.15"], "/brands/platforms/linux.svg"],
    [["Ubuntu", "Ubuntu 24.04"], "/brands/platforms/ubuntu.svg"],
    [["Debian", "Debian 13"], "/brands/platforms/debian.svg"],
    [["Arch", "ArchLinux", "Arch Linux"], "/brands/platforms/arch-linux.svg"],
    [["Fedora", "Fedora 43"], "/brands/platforms/fedora.svg"],
    [["FreeBSD", "FreeBSD 14"], "/brands/platforms/freebsd.svg"],
    [["PlayStation", "PlayStation 5"], "/brands/platforms/playstation.svg"],
    [["KaiOS", "KaiOS 3"], "/brands/platforms/kaios.svg"],
    [["iOS", "iOS 26"], "/images/icon/os/ios.png"],
    [["iPadOS", "iPadOS 26", "iPad OS 18"], "/images/icon/os/ipad_os.png"],
    [["macOS", "macOS 26", "Mac", "Mac OS X 10.15"], "/images/icon/os/mac.png"],
    [["Chrome OS", "ChromeOS", "Chrome OS 145"], "/images/icon/os/chrome_os.png"],
    [["Fire OS", "FireOS 8"], "/images/icon/os/fire_os.png"],
    [["HarmonyOS", "HarmonyOS 5"], "/images/icon/os/harmony_os.png"],
    [["Tizen", "Tizen 8"], "/images/icon/os/tizen.png"],
  ])
  expect(render("os", "macOS 26").html).toContain("platform-icon-neutral")
  for (const [kind, name] of [["browser", "ChromeClone"], ["os", "Windowsill"], ["browser", ""], ["os", "Unknown OS"]] as const) {
    const { html, src } = render(kind, name)
    expect(src).toBeUndefined()
    expect(html).toContain("h-4 w-4 shrink-0")
    expect(html).not.toContain("fa-brands")
    expect(html).toContain(kind === "browser" ? "fa-browser" : "fa-circle-question")
  }
})

test("pinned The SVG assets are self-contained and preserve color plus license provenance", () => {
  const directory = new URL("brands/platforms/", publicRoot)
  const manifest = JSON.parse(readFileSync(new URL("sources.json", directory), "utf8"))
  expect(manifest.repository).toBe("https://github.com/glincker/thesvg")
  expect(manifest.commit).toMatch(/^[a-f0-9]{40}$/)
  const files = readdirSync(directory).filter((x) => x.endsWith(".svg"))
  expect(files.sort()).toEqual(manifest.assets.map((x: {file: string}) => x.file).sort())
  for (const asset of manifest.assets) {
    const svg = readFileSync(new URL(asset.file, directory), "utf8")
    expect(asset.license.length).toBeGreaterThan(0)
    expect(asset.source).toContain(`/${manifest.commit}/public/icons/`)
    expect(svg).toMatch(/<svg\b[^>]*viewBox=/)
    expect(svg).toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(svg).not.toMatch(/currentColor|<script\b|<foreignObject\b|<image\b|<iframe\b|\bon\w+\s*=|<!DOCTYPE|<!ENTITY|javascript:|@import/i)
    for (const match of svg.matchAll(/(?:href|src)=["']([^"']*)/g)) expect(match[1]).toStartWith("#")
    for (const match of svg.matchAll(/url\(([^)]*)\)/g)) expect(match[1].replace(/["']/g, "").trim()).toStartWith("#")
  }
  for (const license of ["LICENSE.CC-BY-3.0.txt", "LICENSE.CC-BY-SA-3.0.txt", "LICENSE.CC-BY-4.0.txt"]) {
    expect(readFileSync(new URL(license, directory), "utf8").length).toBeGreaterThan(1000)
  }
  const source = renderToStaticMarkup(<RowIcon kind="source" name="Google"/>)
  expect(source).toContain('/brands/sources/google.svg')
  expect(source).not.toContain("thesvg.org")
})
