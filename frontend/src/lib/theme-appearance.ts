export type ThemePreference = "system" | "light" | "dark"

function themePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "light" ? value : "system"
}

/** Only public appearance preferences cross the root loader boundary. */
export function rootAppearancePreferences(user: { locale?: unknown; theme?: unknown } | null, localeCookie: unknown): { locale: "en" | "zh-CN"; theme: ThemePreference } {
  const locale = user?.locale === "en" || user?.locale === "zh-CN"
    ? user.locale
    : localeCookie === "en" ? "en" : "zh-CN"
  return { locale, theme: themePreference(user?.theme) }
}

/** Resolve system appearance before styles paint, without another stored preference. */
export function themeBootstrapScript(preference: unknown): string {
  return `(function(){var value=${JSON.stringify(themePreference(preference))};if(value==="system"){try{value=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){value="light"}}document.documentElement.dataset.theme=value})()`
}
