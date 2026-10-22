import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inspectCnWhois, parseCnWhois } from "../src/lib/site-check-whois"

const record = (date = "2030-10-22 18:30:00", domain = "example.com.cn") => `Domain Name: ${domain}\r\nRegistration Time: 2001-01-01 00:00:00\r\nExpiration Time: ${date}\r\nName Server: ns.example.cn\r\n`

test("CNNIC expiry requires a matching registered domain and explicit expiration field", () => {
  expect(parseCnWhois("example.com.cn", record())).toEqual({expiresAt: "2030-10-22", error: null})
  expect(parseCnWhois("example.cn", record("2030-10-22 18:30:00", "EXAMPLE.CN")).expiresAt).toBe("2030-10-22")
  expect(parseCnWhois("xn--fsqu00a.cn", record("2030-10-22 18:30:00", "xn--fsqu00a.cn")).expiresAt).toBeTruthy()
  for (const body of [record(undefined, "wrong.cn"), record() + "Domain Name: other.cn\n", "Expiration Time: 2030-10-22 18:30:00\n"]) {
    const result = parseCnWhois("example.com.cn", body)
    expect(result.expiresAt).toBeNull()
    expect(result.error).toBeTruthy()
  }
  const noExpiry = parseCnWhois("example.cn", "Domain Name: example.cn\nRegistration Time: 2001-01-01 00:00:00\nUpdated Time: 2030-10-22 18:30:00\n")
  expect(noExpiry).toMatchObject({expiresAt: null, retryable: false})
  expect(noExpiry.error).toContain("未返回该域名的到期时间")
})

test("CNNIC dates reject normalization, ambiguous formats and duplicate fields", () => {
  for (const value of ["2030-02-29 18:30:00", "2030-04-31 18:30:00", "2030-00-22 18:30:00", "2030-10-00 18:30:00", "2030-10-22 24:30:00", "2030-10-22 18:60:00", "2030-10-22 18:30:60", "22/10/2030", "2030-10-22", "2030-10-22 18:", "2030-10-22 18:30:00 garbage", "2030-10-22T18:30:00+15:00", "2030-10-22T18:30:00+08:61"]) {
    const result = parseCnWhois("example.com.cn", record(value))
    expect(result.expiresAt).toBeNull()
    expect(result.error).toContain("格式无效")
  }
  expect(parseCnWhois("example.com.cn", record("2028-02-29 00:00:00")).expiresAt).toBe("2028-02-29")
  expect(parseCnWhois("example.com.cn", record("2030-10-22T18:30:00Z")).expiresAt).toBe("2030-10-22T18:30:00.000Z")
  expect(parseCnWhois("example.com.cn", record("2030-10-22T18:30:00+08:00")).expiresAt).toBe("2030-10-22T10:30:00.000Z")
  expect(parseCnWhois("example.com.cn", record("2030-10-22T18:30:00-0530")).expiresAt).toBe("2030-10-23T00:00:00.000Z")
  expect(parseCnWhois("example.com.cn", record() + "Expiration Time: 2031-01-01 00:00:00\n").expiresAt).toBeNull()
})

test("WHOIS input cannot inject queries, endpoints, subdomains or non-CNNIC suffixes", async () => {
  for (const domain of ["example.cn\r\nother.cn", "example.cn\n", " example.cn", "example.cn ", "example.cn:43", "example.cn/path", "user@example.cn", "example.cn?query", "example.cn#fragment", "-h.cn", "example-.cn", "www.example.com.cn", "com.cn", "cn", "example.net", "example中国.cn", "K.cn", "a".repeat(64) + ".cn"]) {
    const result = await inspectCnWhois(domain, AbortSignal.timeout(100))
    expect(result).toMatchObject({expiresAt: null, retryable: false})
    expect(result.error).toContain("有效的 .cn 可注册域名")
  }
})

test("WHOIS limit and unavailable responses never become expiry dates", () => {
  const limited = parseCnWhois("example.cn", "% Error: Quota exceeded.\n")
  expect(limited).toMatchObject({expiresAt: null, retryable: true})
  expect(limited.error).toContain("查询受限")
  const excessive = parseCnWhois("example.com.cn", record() + "x".repeat(64 * 1024))
  expect(excessive.expiresAt).toBeNull()
  expect(excessive.error).toContain("响应内容过大")
  expect(parseCnWhois("example.cn", "No matching record.\n").error).toContain("未返回该域名的记录")
  expect(parseCnWhois("example.cn", "The info does not exist.")).toMatchObject({expiresAt: null, retryable: false})
  expect(parseCnWhois("example.cn", "System is busy, please try again later!")).toMatchObject({expiresAt: null, retryable: true})
  expect(parseCnWhois("example.cn", "")).toMatchObject({expiresAt: null, retryable: true})
})

test("production Node WHOIS sockets bound DNS/connect/read, pin public addresses and reject incomplete responses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litestats-whois-run-"))
  try {
    const build = await Bun.build({entrypoints: [new URL("./fixtures/site-check-whois-node.ts", import.meta.url).pathname], outdir: directory, target: "node"})
    expect(build.success).toBe(true)
    const child = Bun.spawn(["node", build.outputs[0].path], {stdout: "pipe", stderr: "pipe", env: {...process.env, TZ: "America/New_York"}})
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({code, stderr}).toEqual({code: 0, stderr: ""})
    expect(stdout).toContain("PASS: Node CNNIC WHOIS transport")
  } finally {await rm(directory, {recursive: true, force: true})}
}, 15_000)
