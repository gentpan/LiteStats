import { expect, test } from "bun:test"
import { extractSearchQuery } from "../src/lib/languages"

test("extracts disclosed search terms from supported desktop and mobile search pages", () => {
  for (const referrer of [
    "https://www.google.com/search?q=网站+统计",
    "http://www.google.co.uk/search?q=网站+统计",
    "https://www.google.co.jp/search?q=网站+统计",
    "https://www.google.com.hk/search?q=网站+统计",
    "https://www.google.com.au/search?q=网站+统计",
    "https://www.google.co.uz/search?q=网站+统计",
    "https://images.google.de/search?q=网站+统计",
    "https://www.bing.com/search?q=网站+统计",
    "https://cn.bing.com/search?q=网站+统计",
    "https://search.yahoo.com/search?p=网站+统计",
    "https://uk.search.yahoo.com/search?p=网站+统计",
    "https://search.yahoo.co.jp/search?p=网站+统计",
    "https://duckduckgo.com/?q=网站+统计",
    "https://html.duckduckgo.com/html/?q=网站+统计",
    "https://www.baidu.com/s?wd=网站+统计",
    "https://m.baidu.com/s?word=网站+统计",
    "https://yandex.ru/search/?text=网站+统计",
    "https://yandex.com.tr/search/?text=网站+统计",
    "https://yandex.uz/search/?text=网站+统计",
    "https://www.sogou.com/web?query=网站+统计",
    "https://www.sogou.com/sogou?query=网站+统计",
    "https://www.so.com/s?q=网站+统计",
    "https://search.brave.com/search?q=网站+统计",
    "https://WWW.GOOGLE.COM./search?q=网站+统计",
  ]) expect(extractSearchQuery(referrer)).toBe("网站 统计")
})

test("does not mistake lookalike domains, user information or other protocols for search engines", () => {
  for (const referrer of [
    "https://google.com.attacker.example/search?q=spoofed",
    "https://notbing.example/search?q=spoofed",
    "https://bing.example/search?q=spoofed",
    "https://google.example/search?q=spoofed",
    "https://google.com.example/search?q=spoofed",
    "https://notgoogle.com/search?q=spoofed",
    "https://search.yahoo.com.evil.example/search?p=spoofed",
    "https://fakesearch.yahoo.com/search?p=spoofed",
    "https://search.yahoo.example/search?p=spoofed",
    "https://duckduckgo.com.example/?q=spoofed",
    "https://baidu.com.example/s?wd=spoofed",
    "https://yandex.example/search?text=spoofed",
    "https://so.com.example/s?q=spoofed",
    "https://sogou.com.example/web?query=spoofed",
    "https://search.brave.com.example/search?q=spoofed",
    "https://www.google.com@attacker.example/search?q=spoofed",
    "https://attacker@example.google.com/search?q=spoofed",
    "https://attacker@www.google.com/search?q=spoofed",
    "ftp://www.google.com/search?q=spoofed",
    "javascript://www.google.com/search?q=spoofed",
    "//www.google.com/search?q=spoofed",
    "/search?q=spoofed", "not a URL", "",
  ]) expect(extractSearchQuery(referrer)).toBe("")
})

test("does not invent hidden terms or confuse campaigns, redirects and product searches with organic keywords", () => {
  for (const referrer of [
    "https://www.google.com/",
    "https://www.google.com/search?utm_term=campaign&query=unsupported",
    "https://www.example.com/?utm_source=google&utm_term=campaign&q=site-search",
    "https://www.baidu.com/s?utm_term=campaign",
    "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2F",
    "https://mail.google.com/?q=private-mail",
    "https://support.google.com/search?q=help",
    "https://finance.yahoo.com/search?p=stock",
    "https://zhidao.baidu.com/search?word=question",
    "https://maps.yandex.ru/?text=address",
    "https://www.brave.com/search?q=site-search",
    "https://www.so.com/account?q=site-search",
    "https://www.sogou.com/help?query=site-search",
  ]) expect(extractSearchQuery(referrer)).toBe("")
})

test("normalizes decoded whitespace and control characters and preserves international query text", () => {
  expect(extractSearchQuery("https://www.google.com/search?q=%20%20%E7%BD%91%E7%AB%99%00%09%0A%E7%BB%9F%E8%AE%A1%7F%20")).toBe("网站 统计")
  expect(extractSearchQuery("https://www.google.com/search?q=%E2%80%AEhello%E2%80%AC")).toBe("hello")
  expect(extractSearchQuery("https://www.baidu.com/s?wd=%00%20%09&word=valid")).toBe("valid")
  expect(extractSearchQuery("https://www.google.com/search?q=%00%20%09")).toBe("")
  expect(extractSearchQuery(`https://www.google.com/search?q=${encodeURIComponent("café + 日本語 👨‍👩‍👧")}`)).toBe("café + 日本語 👨‍👩‍👧")
})

test("fits the collector's 300-code-unit limit without cutting Unicode surrogate pairs", () => {
  expect(extractSearchQuery(`https://www.google.com/search?q=${"a".repeat(350)}`)).toBe("a".repeat(300))
  expect(extractSearchQuery(`https://www.google.com/search?q=${"a".repeat(298)}😀ignored`)).toBe(`${"a".repeat(298)}😀`)
  expect(extractSearchQuery(`https://www.google.com/search?q=${"a".repeat(299)}😀ignored`)).toBe("a".repeat(299))
})
