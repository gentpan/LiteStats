import { expect, test } from "bun:test"
import { normalizeDomain } from "../src/lib/site-domain"

test("domain claims normalize URL, case, www, ports and international hostnames consistently", () => {
  for (const input of ["example.com", " EXAMPLE.com ", "https://www.example.com/path", "HTTP://Example.COM:8080/", "example.com."]) {
    expect(normalizeDomain(input)).toBe("example.com")
  }
  expect(normalizeDomain("https://例子.测试/")).toBe("xn--fsqu00a.xn--0zwm56d")
  expect(normalizeDomain("demo.local.test")).toBe("demo.local.test")
})

test("invalid domains and URLs containing credentials are rejected before writes", () => {
  for (const input of ["", " ", "bad host", "https://", "https://user:password@example.com", "ftp://example.com"]) {
    expect(() => normalizeDomain(input)).toThrow("请填写有效域名")
  }
})
