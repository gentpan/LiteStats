const NAMES: Record<string, string> = {
  zh: "中文", "zh-CN": "中文", "zh-Hans": "中文", "zh-TW": "中文（台湾）", "zh-Hant": "中文（繁体）", "zh-HK": "中文（香港）",
  en: "英语", "en-US": "英语", "en-GB": "英语（英国）", "en-AU": "英语（澳大利亚）",
  ja: "日语", "ja-JP": "日语",
  ko: "韩语", "ko-KR": "韩语",
  de: "德语", "de-DE": "德语",
  fr: "法语", "fr-FR": "法语",
  es: "西班牙语", "es-ES": "西班牙语", "es-MX": "西班牙语（墨西哥）",
  pt: "葡萄牙语", "pt-BR": "葡萄牙语（巴西）", "pt-PT": "葡萄牙语",
  ru: "俄语", "ru-RU": "俄语",
  it: "意大利语", "it-IT": "意大利语",
  nl: "荷兰语", "nl-NL": "荷兰语",
  pl: "波兰语", "pl-PL": "波兰语",
  tr: "土耳其语", "tr-TR": "土耳其语",
  ar: "阿拉伯语", "ar-SA": "阿拉伯语",
  hi: "印地语", "hi-IN": "印地语",
  th: "泰语", "th-TH": "泰语",
  vi: "越南语", "vi-VN": "越南语",
  id: "印尼语", "id-ID": "印尼语",
  sv: "瑞典语", "da": "丹麦语", "fi": "芬兰语", "no": "挪威语", "nb": "挪威语",
  et: "爱沙尼亚语", "et-EE": "爱沙尼亚语",
  cs: "捷克语", "hu": "匈牙利语", "ro": "罗马尼亚语", "el": "希腊语",
  uk: "乌克兰语", "he": "希伯来语", "fa": "波斯语",
}

export function languageName(code: string) {
  const raw = (code || "").replace(/\0/g, "").trim()
  if (!raw || raw === "(none)" || raw === "(NONE)") return "未知"
  const key = raw.replace("_", "-")
  const short = key.split("-")[0]
  return NAMES[key] || NAMES[short] || key
}

export function parseAcceptLanguage(header: string) {
  const first = (header || "").split(",")[0] || ""
  return first.split(";")[0].trim().replace("_", "-").slice(0, 16)
}

export function extractSearchQuery(referrer: string) {
  try {
    const u = new URL(referrer)
    const host = u.hostname.replace(/^www\./, "").toLowerCase()
    const q = u.searchParams
    if (host.includes("google.")) return q.get("q") || q.get("query") || ""
    if (host.includes("bing.")) return q.get("q") || ""
    if (host.includes("yahoo.")) return q.get("p") || q.get("q") || ""
    if (host.includes("duckduckgo.")) return q.get("q") || ""
    if (host.includes("baidu.")) return q.get("wd") || q.get("word") || ""
    if (host.includes("yandex.")) return q.get("text") || ""
    return ""
  } catch {
    return ""
  }
}
