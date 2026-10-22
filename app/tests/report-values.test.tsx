import { expect, test } from "bun:test"
import { countryName } from "../src/lib/countries"
import { reportSearchText, reportValueLabel, resolveReportFilter } from "../src/lib/report-values"

test("report labels follow the active locale instead of language or country snapshots", () => {
  expect(reportValueLabel("language", "zh_cn", "zh-CN", "Chinese")).toBe("中文")
  expect(reportValueLabel("language", "zh_cn", "en", "中文")).toContain("Chinese")
  expect(reportValueLabel("country", "CN", "zh-CN", "China")).toBe("中国")
  expect(reportValueLabel("country", "CN", "en", "中国")).toContain("China")
  for (const kind of ["browser", "os"]) {
    for (const name of ["", "  ", "(none)", "(NONE)"]) {
      expect(reportValueLabel(kind, name, "zh-CN", "Old label")).toBe("未知")
      expect(reportValueLabel(kind, name, "en", "旧标签")).toBe("Unknown")
    }
    expect(reportValueLabel(kind, "Chrome", "en")).toBe("Chrome")
  }
  expect(reportValueLabel("page", "/en", "zh-CN", "English page")).toBe("English page")
  expect(reportValueLabel(undefined, "Raw", "en")).toBe("Raw")
})

test("direct display changes only source values and retains real domains and campaign labels", () => {
  for (const name of ["Direct", " direct ", "DIRECT", "Direct / None", "(none)", ""]) {
    expect(reportValueLabel("source", name, "zh-CN", "Snapshot")).toBe("直接访问")
    expect(reportValueLabel("source", name, "en", "旧标签")).toBe("Direct traffic")
  }
  for (const name of ["direct.com", "Yandex.Direct", "Direct newsletter", "Direct traffic", "none"]) {
    expect(reportValueLabel("source", name, "zh-CN")).toBe(name)
    expect(reportValueLabel("source", name, "en")).toBe(name)
  }
  for (const kind of ["page", "campaign", "title", undefined]) {
    expect(reportValueLabel(kind, "Direct", "zh-CN")).toBe("Direct")
  }
})

test("search includes raw keys, canonical language tags and current localized labels", () => {
  const language = { name: "zh_cn", label: "Snapshot not to use" }
  expect(reportSearchText("language", language, "zh-CN")).toBe("zh_cn 中文 zh-CN")
  const english = reportSearchText("language", language, "en")
  expect(english).toContain("zh_cn")
  expect(english).toContain("Chinese")
  expect(english).toContain("zh-CN")
  expect(english).not.toContain("Snapshot")
  expect(reportSearchText("source", {name: "Direct"}, "zh-CN")).toBe("Direct 直接访问")
  expect(reportSearchText("source", {name: "Direct"}, "en")).toBe("Direct Direct traffic")
  expect(reportSearchText("os", {name: "(none)"}, "en")).toBe("(none) Unknown")
})

test("filtering resolves localized direct input without depending on available candidates", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    for (const entered of ["直接访问", "Direct traffic", " DIRECT ", "direct", "direct TRAFFIC"]) {
      expect(resolveReportFilter("source", entered, [], locale)).toBe("Direct")
      expect(resolveReportFilter("source", entered, [{name: "Google"}], locale)).toBe("Direct")
    }
  }
  for (const entered of ["Direct / None", "direct/none", "(none)", "none", "direct.com", "Yandex.Direct"]) {
    expect(resolveReportFilter("source", entered, [], "en")).toBe(entered)
  }
  expect(resolveReportFilter("page", "Direct traffic", [], "en")).toBe("Direct traffic")
})

test("exact stored keys beat translated labels and preserve distinct historical aliases", () => {
  const options = [{name: "Direct"}, {name: "DIRECT"}, {name: "direct"}, {name: " direct "}, {name: "Direct / None"}, {name: "(none)"}, {name: "Direct traffic"}, {name: "直接访问"}]
  for (const locale of ["zh-CN", "en"] as const) {
    for (const option of options) {
      expect(resolveReportFilter("source", option.name, options, locale)).toBe(option.name)
    }
    // A real campaign key still wins if typed with different case than its storage.
    expect(resolveReportFilter("source", "direct TRAFFIC", options, locale)).toBe("Direct traffic")
  }
  expect(resolveReportFilter("source", "Direct traffic", [{name: "Direct / None"}], "en")).toBe("Direct / None")
  expect(resolveReportFilter("source", "直接访问", [{name: "(none)"}], "zh-CN")).toBe("(none)")
  expect(resolveReportFilter("page", "Campaign", [{name: "/page", label: "Campaign"}, {name: "Campaign"}], "en")).toBe("Campaign")
})

test("other report filters resolve current display labels while preserving original keys", () => {
  expect(resolveReportFilter("country", countryName("CN", "en"), [{name: "CN", label: "中国"}], "en")).toBe("CN")
  expect(resolveReportFilter("country", "中国", [{name: "CN", label: "China"}], "zh-CN")).toBe("CN")
  expect(resolveReportFilter("country", " us ", [], "en")).toBe("US")
  expect(resolveReportFilter("language", "中文", [{name: "zh_cn", label: "Chinese"}], "zh-CN")).toBe("zh_cn")
  expect(resolveReportFilter("os", "Unknown", [{name: "(none)"}], "en")).toBe("(none)")
  expect(resolveReportFilter("browser", "chrome", [{name: "Chrome"}], "en")).toBe("Chrome")
  expect(resolveReportFilter("page", " /long/path ", [], "en")).toBe("/long/path")
})
