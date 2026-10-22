/** Real Gregorian calendar dates, without Date's silent overflow normalization. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

export function isDateRange(from: unknown, to: unknown) {
  return isCalendarDate(from) && isCalendarDate(to) && from <= to
}

const timezones = new Map<string, string | null>()

/** Accept named zones and their aliases, but not Intl-only numeric offsets. */
export function canonicalTimezone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z_][A-Za-z0-9_+\-/]*$/.test(value)) return null
  if (timezones.has(value)) return timezones.get(value)!
  let zone: string | null = null
  try {
    zone = new Intl.DateTimeFormat("en", {timeZone: value}).resolvedOptions().timeZone
  } catch { /* Unsupported names are rejected on writes and safely handled on reads. */ }
  // Bound the cache even when validation receives arbitrary user input.
  if (timezones.size >= 128) timezones.clear()
  timezones.set(value, zone)
  return zone
}

/** Runtime fallback only: never repairs or rewrites a stored site setting. */
export function safeTimezone(value: unknown) {
  return canonicalTimezone(value) || "UTC"
}

export function dateInTimezone(timezone: unknown, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`
}
