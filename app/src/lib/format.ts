const THOUSAND = 1000
const HUNDRED_THOUSAND = 100000
const MILLION = 1000000

export function numberShort(num: number): string {
  if (num >= THOUSAND && num < MILLION) {
    const thousands = num / THOUSAND
    if (thousands === Math.floor(thousands) || num >= HUNDRED_THOUSAND) return `${Math.floor(thousands)}k`
    return `${Math.floor(thousands * 10) / 10}k`
  }
  if (num >= MILLION) {
    const millions = num / MILLION
    if (millions === Math.floor(millions) || num >= 100000000) return `${Math.floor(millions)}M`
    return `${Math.floor(millions * 10) / 10}M`
  }
  return String(num)
}

export function percentShort(n: number) {
  if (Math.abs(n) > 0 && Math.abs(n) < 0.1) return `${n.toFixed(2)}%`
  return `${n.toFixed(1).replace(/\.0$/, "")}%`
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function parseStamp(date: string) {
  if (date.includes(" ")) {
    const [d, t] = date.split(" ")
    const [y, m, day] = d.split("-").map(Number)
    const [hh, mm] = (t || "00:00").split(":").map(Number)
    return new Date(y, (m || 1) - 1, day || 1, hh || 0, mm || 0)
  }
  const [y, m, day] = date.split("-").map(Number)
  return new Date(y, (m || 1) - 1, day || 1)
}

export function formatDayShort(date: string, withYear = false) {
  const d = parseStamp(date)
  const label = `${d.getDate()} ${MONTHS_EN[d.getMonth()]}`
  return withYear ? `${label} ${d.getFullYear()}` : label
}

export function formatDayLong(date: string, withYear = false) {
  const d = parseStamp(date)
  const day = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_EN[d.getMonth()]}`
  return withYear ? `${day} ${d.getFullYear()}` : day
}

export function formatMonthYYYY(date: string) {
  const d = parseStamp(date)
  return `${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`
}

export function formatClock(date: string, withMinutes = false) {
  const d = parseStamp(date)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, "0")
  return withMinutes ? `${h}:${m}` : `${h}:00`
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}h${String(m).padStart(2, "0")}m`
  if (m) return `${m}m${String(r).padStart(2, "0")}s`
  return `${s}s`
}
