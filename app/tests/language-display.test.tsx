import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { List } from "../src/components/ui"
import { I18nProvider } from "../src/lib/i18n"
import { languageCode, languageFlag, languageName } from "../src/lib/languages"

test("language labels retain distinct canonical tags and their locale flags", () => {
  for (const [raw, code, flag] of [
    ["zh_cn", "zh-CN", "cn"], ["zh-TW", "zh-TW", "tw"],
    ["zh_HK", "zh-HK", "hk"], ["en_us", "en-US", "us"],
    ["en-GB", "en-GB", "gb"], ["en-AU", "en-AU", "au"],
    ["ja-JP", "ja-JP", "jp"], ["ko-KR", "ko-KR", "kr"],
    ["zh-Hant", "zh-Hant", "tw"], ["zh-Hans", "zh-Hans", "cn"],
  ]) {
    expect(languageCode(raw)).toBe(code)
    expect(languageFlag(raw)).toBe(flag)
  }
  expect(languageCode("en")).toBe("en")
  expect(languageName("zh_cn")).toBe("中文")
  expect(languageName("en-GB")).toBe("英语（英国）")
  expect(languageName("zh-CN", "en")).toContain("Chinese")
})

test("missing, unknown and non-country language regions have a neutral flag", () => {
  for (const raw of ["", "(none)", "(NONE)", "und", "mul", "zxx", "en-001", "es-419", "not/a/locale"]) {
    expect(languageFlag(raw)).toBe("xx")
  }
  expect(languageName("(none)")).toBe("未知")
  expect(languageName("", "en")).toBe("Unknown")
  expect(languageCode("  zh-CN\0  ")).toBe("zh-CN")
})

test("language cards and expanded lists show names, tags and square flags without changing counts", () => {
  const rows = [
    {name: "zh-CN", value: 80}, {name: "en-US", value: 52},
    {name: "zh-TW", value: 18}, {name: "en-GB", value: 17},
    {name: "en", value: 14}, {name: "en-AU", value: 14},
  ]
  for (const expanded of [false, true]) {
    for (const locale of ["zh-CN", "en"] as const) {
      const html = renderToStaticMarkup(<I18nProvider locale={locale}><List plain expanded={expanded} kind="language" maxItems={0} rows={rows}/></I18nProvider>)
      for (const row of rows) {
        expect(html).toContain(`lang="en">${row.name}</span>`)
        expect(html).toContain(languageName(row.name, locale))
        expect(html).toContain(`>${row.value}</span>`)
      }
      for (const flag of ["cn", "us", "tw", "gb", "au"]) {
        expect(html).toContain(`/images/flags/1x1/${flag}.svg`)
      }
      expect(html).not.toContain("/4x3/")
      expect(html).not.toContain("http")
    }
  }
})

test("invalid historical language text stays escaped and never becomes an asset path", () => {
  const name = '<img src=x onerror="alert(1)">'
  const html = renderToStaticMarkup(<I18nProvider locale="zh-CN"><List plain kind="language" rows={[{name, value: 1}]}/></I18nProvider>)
  expect(html).toContain("/images/flags/1x1/xx.svg")
  expect(html).toContain("&lt;img")
  expect(html).not.toContain('<img src="x"')
})
