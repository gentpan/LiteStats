const FALLBACK = [
  "Pacific/Honolulu", "America/Los_Angeles", "America/Denver", "America/Chicago",
  "America/New_York", "America/Sao_Paulo", "UTC", "Europe/London", "Europe/Berlin",
  "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Shanghai",
  "Asia/Hong_Kong", "Asia/Taipei", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Sydney", "Pacific/Auckland",
]

export function timezoneOptions() {
  const zones = typeof Intl !== "undefined" && "supportedValuesOf" in Intl
    ? Intl.supportedValuesOf("timeZone")
    : FALLBACK
  return zones.map((value) => ({ value, label: timezoneLabel(value) }))
}

export function timezoneLabel(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date())
    const offset = parts.find((p) => p.type === "timeZoneName")?.value || "GMT"
    return `(${offset}) ${tz}`
  } catch {
    return tz
  }
}
