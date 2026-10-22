import { describe, expect, test } from "bun:test"
import { translate } from "../src/lib/i18n"
import { countryName } from "../src/lib/countries"
import { languageName } from "../src/lib/languages"
import { PERIOD_LABEL, INTERVAL_LABEL, INTERVAL_VIEW } from "../src/lib/range"
import UI_EN from "../src/lib/ui-en.json"
import { readFileSync } from "node:fs"
import { seoAiErrorMessages } from "../src/lib/seo-ai"

describe("interface localization", () => {
  test("navigation, reports and date menus resolve in both languages", () => {
    expect(translate("zh-CN", "nav.sites")).toBe("站点")
    expect(translate("en", "nav.sites")).toBe("Sites")
    for (const key of [...Object.keys(UI_EN), ...Object.values(PERIOD_LABEL), ...Object.values(INTERVAL_LABEL), ...Object.values(INTERVAL_VIEW)]) {
      if (key === "中文") continue // Language-picker autonym stays recognizable.
      expect(translate("en", key)).not.toMatch(/[\u4e00-\u9fff]/)
    }
  })
  test("interpolation preserves zeros and treats values as plain data", () => {
    expect(translate("en", "找到 {0} 份备份", { 0: 0 })).toBe("Found 0 backups")
    expect(translate("zh-CN", "找到 {0} 份备份", { 0: 2 })).toBe("找到 2 份备份")
    expect(translate("en", "demo.local.test")).toBe("demo.local.test")
    expect(translate("en", "constructor")).toBe("constructor")
    expect(translate("en", "{constructor}", {})).toBe("{constructor}")
  })
  test("country and visitor language labels follow the interface locale", () => {
    expect(countryName("US", "en")).toBe("United States")
    expect(countryName("US", "zh-CN")).toBe("美国")
    expect(countryName("", "en")).toBe("Unknown")
    expect(languageName("zh-CN", "en")).not.toMatch(/[\u4e00-\u9fff]/)
    expect(languageName("en", "zh-CN")).toBe("英语")
  })
  test("keyword workspace, integrations and fixed AI failures have complete English labels", () => {
    const files = [
      "routes/dashboard.tsx", "routes/sites/$domain.settings.tsx", "routes/sites/$domain.keywords.tsx",
      "components/KeywordReport.tsx", "components/KeywordImportPanel.tsx", "components/KeywordSeoPanel.tsx", "components/KeywordTable.tsx",
    ]
    const labels = new Set(Object.values(seoAiErrorMessages))
    for (const file of files) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
      // Include conditional and mapped labels as well as direct t("...") calls.
      for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
        if (/[\u4e00-\u9fff]/.test(match[1])) labels.add(JSON.parse(match[0]))
      }
    }
    for (const label of labels) {
      expect(Object.hasOwn(UI_EN, label)).toBe(true)
      expect(translate("en", label)).not.toMatch(/[\u4e00-\u9fff]/)
    }
    expect(translate("en", "预览前 {0} 条，共 {1} 条", {0: 10, 1: 25})).toBe("Previewing the first 10 of 25 rows")
    expect(translate("en", "显示 {0}–{1}，共 {2} 条", {0: 0, 1: 0, 2: 0})).toBe("Showing 0–0 of 0 rows")
  })
  test("the translation catalog contains no duplicate keys", () => {
    const source = readFileSync(new URL("../src/lib/ui-en.json", import.meta.url), "utf8")
    const keys = [...source.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)].map(match => JSON.parse(match[1]))
    expect(new Set(keys).size).toBe(keys.length)
  })
})
