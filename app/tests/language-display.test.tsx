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

test("regional and script language names remain specific in both interface languages", () => {
  const traditional = languageName("zh_Hant_TW")
  expect(traditional).toContain("繁体")
  expect(traditional).toContain("台湾")
  expect(languageFlag("zh_Hant_TW")).toBe("tw")
  for (const code of ["en-CA", "fr-CA"]) {
    expect(languageName(code)).toContain("加拿大")
    expect(languageName(code, "en")).toContain("Canadian")
    expect(languageFlag(code)).toBe("ca")
  }
  // Extensions stay visible in the code, without replacing the language name.
  for (const code of ["zh-u-ca-chinese", "en-US-u-hc-h12", "fr-CA-x-test"]) {
    const base = new Intl.Locale(code).baseName
    expect(languageCode(code)).toBe(Intl.getCanonicalLocales(code)[0])
    for (const locale of ["zh-CN", "en"]) {
      expect(languageName(code, locale)).toBe(languageName(base, locale))
      expect(languageName(code, locale)).not.toBe(code)
    }
  }
})

test("invisible historical controls cannot spoof a language label or code", () => {
  const raw = " \u202ezh_\u2066TW\u2069\u202c\u0000\u061c\u200e\u200f "
  expect(languageCode(raw)).toBe("zh-TW")
  expect(languageFlag(raw)).toBe("tw")
  expect(languageName(raw)).toBe("中文（台湾）")
})

test("invalid language names cannot inherit values from the label dictionary prototype", () => {
  for (const name of ["constructor", "hasOwnProperty", "toLocaleString"]) {
    for (const locale of ["zh-CN", "en"] as const) {
      expect(languageName(name, locale)).toBe(name)
      const html = renderToStaticMarkup(<I18nProvider locale={locale}><List plain kind="language" rows={[{ name, value: 7 }]}/></I18nProvider>)
      expect(html).toContain(`>${name}</span>`)
      expect(html).toContain(">7</span>")
      expect(html).toContain("/images/flags/1x1/xx.svg")
    }
  }
})

test("language cards and expanded lists show names, tags and square flags without changing counts", () => {
  const rows = [
    {name: "zh-CN", value: 80}, {name: "en-US", value: 52},
    {name: "zh-TW", value: 18}, {name: "en-GB", value: 17},
    {name: "en", value: 14}, {name: "en-AU", value: 14},
    {name: "zh-Hant-TW", value: 10}, {name: "fr-CA-u-hc-h12", value: 6},
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
