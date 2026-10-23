import { countryName } from "./countries"
import { translate, type Locale } from "./i18n"
import { languageCode, languageName } from "./languages"
import { isDirectSource } from "./source-icons"
import { geographyLabel } from "./geography"

type ReportValue = { name: string; label?: string; code?: string }

/** Resolve display text at render time so changing locale cannot leave stale labels. */
export function reportValueLabel(kind: string | undefined, name: string, locale: Locale, label?: string, country?: string): string {
  if (kind === "language") return languageName(name, locale)
  if (kind === "country") return countryName(name, locale)
  if (kind === "region" || kind === "city") return geographyLabel(kind, label || name, country || "", locale)
  if (kind === "source" && isDirectSource(name)) return translate(locale, "直接访问")
  if ((kind === "browser" || kind === "os") && (!name.trim() || name.trim().toLowerCase() === "(none)")) {
    return translate(locale, "未知")
  }
  return label || name
}

/** Retain the stored key for search while exposing the current localized display value. */
export function reportSearchText(kind: string | undefined, row: ReportValue, locale: Locale): string {
  return [row.name, reportValueLabel(kind, row.name, locale, row.label, row.code), kind === "language" ? languageCode(row.name) : ""]
    .filter(Boolean).join(" ")
}

/** Return an original filter key, never a translated label or a merged historical group. */
export function resolveReportFilter(kind: string | undefined, entered: string, options: ReportValue[], locale: Locale): string {
  const value = entered.trim()
  // Exact stored keys must win even when another option uses that text as its label.
  const exact = options.find(option => option.name === entered) || options.find(option => option.name === value)
  if (exact) return exact.name
  const lower = value.toLowerCase()
  const insensitive = options.find(option => option.name.toLowerCase() === lower)
  if (insensitive) return insensitive.name
  const displayed = options.find(option => reportValueLabel(kind, option.name, locale, option.label).toLowerCase() === lower)
  if (displayed) return displayed.name
  // These are input affordances only. Other legacy direct aliases remain exact keys.
  if (kind === "source" && ["direct", "direct traffic", "直接访问"].includes(lower)) return "Direct"
  return kind === "country" ? value.toUpperCase() : value
}
