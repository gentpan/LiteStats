import { describe, expect, test } from "bun:test"
import { translate } from "../src/lib/i18n"
import { countryName } from "../src/lib/countries"
import { languageName } from "../src/lib/languages"
import { PERIOD_LABEL, INTERVAL_LABEL, INTERVAL_VIEW } from "../src/lib/range"
import UI_EN from "../src/lib/ui-en.json"

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
})
