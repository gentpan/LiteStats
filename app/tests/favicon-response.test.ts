import { expect, test } from "bun:test"
import { Route } from "../src/routes/favicon/sources/$name"

// Exercise the real file-route handler with the already-decoded parameter supplied by the router.
const get = (Route.options.server?.handlers as {GET: (context: {params: {name: string}}) => Response}).GET
const request = (name: string) => get({params: {name}})

test("favicon route sends public domains and known sources only to favicon.la", () => {
  for (const [name, host] of [
    ["github.com", "github.com"], ["cnnic.cn", "cnnic.cn"], ["php.net", "php.net"],
    ["Google", "google.com"], ["Bing", "bing.com"], ["X (Twitter)", "x.com"],
    ["Orange Webmail", "orange.fr"], ["Bing Images", "bing.com"],
  ]) {
    const response = request(name!)
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe(`https://favicon.la/${host}`)
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer")
  }
})

test("favicon route normalizes complete URLs, domains with paths, case, www, ports and IDNs", () => {
  for (const [name, host] of [
    [" https://WWW.CNNIC.CN./about?x=1#section ", "cnnic.cn"],
    ["http://github.com:80/docs", "github.com"],
    ["github.com:443/docs", "github.com"],
    ["www.github.com/path", "github.com"],
    ["https://例子.中国/", "xn--fsqu00a.xn--fiqs8s"],
  ]) {
    const response = request(name!)
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe(`https://favicon.la/${host}`)
  }
})

test("favicon route keeps direct-source and link placeholders local while exposing a separate site globe", async () => {
  const source = await request("placeholder").text()
  const site = await request("site-placeholder").text()
  expect(source).not.toBe(site)
  expect(site).toContain("<circle")
  for (const name of ["", "  ", "placeholder", "Direct", "DIRECT / NONE", "(none)"]) {
    const response = request(name)
    expect(response.status).toBe(200)
    expect(response.headers.get("Location")).toBeNull()
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml")
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400")
    expect(await response.text()).toBe(source)
  }
})

test("favicon route does not send local, synthetic, reserved or IP hosts to the external service", async () => {
  const site = await request("site-placeholder").text()
  for (const name of [
    "localhost", "https://localhost/", "office", "office.lan", "office.local", "a.localhost",
    "audit.local.test", "a.invalid", "a.example", "a.internal", "a.onion", "router.home.arpa",
    "example.com", "sub.example.net", "example.org",
    "127.0.0.1", "8.8.8.8", "http://2130706433/", "http://0x7f000001/", "http://127.1/",
    "[::1]", "https://[2606:4700:4700::1111]/",
  ]) {
    const response = request(name)
    expect(response.status).toBe(200)
    expect(response.headers.get("Location")).toBeNull()
    expect(await response.text()).toBe(site)
  }
})

test("favicon route tolerates literal percent signs and object-prototype keys without decoding twice or throwing", async () => {
  const site = await request("site-placeholder").text()
  for (const name of ["%", "%25", "%ZZ", "__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const response = request(name)
    expect(response.status).toBe(200)
    expect(response.headers.get("Location")).toBeNull()
    expect(await response.text()).toBe(site)
  }
})

test("favicon route handles invalid names and URLs locally instead of redirecting unsafe or malformed values", async () => {
  const site = await request("site-placeholder").text()
  for (const name of [
    "javascript:alert(1)", "file:///tmp/icon.svg", "ftp://github.com", "https://name:secret@github.com/",
    "https://github.com:bad/", "https://", "a..com", "-a.com", "a-.com", "a b.com",
    "github.com\\evil.com", "a\n.com", "a".repeat(64) + ".com", "a".repeat(2049),
  ]) {
    const response = request(name)
    expect(response.status).toBe(200)
    expect(response.headers.get("Location")).toBeNull()
    expect(await response.text()).toBe(site)
  }
})
