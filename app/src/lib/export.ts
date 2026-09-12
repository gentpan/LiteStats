import type { Overview, Point, Row, SeriesBy } from "./ch"

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const b of data) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStore(files: Array<{ name: string, content: string }>) {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, data.length, true)
    view.setUint32(22, data.length, true)
    view.setUint16(26, name.length, true)
    local.set(name, 30)
    locals.push(local, data)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length + data.length
  }
  const centralSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  return new Blob([...locals, ...centrals, end], { type: "application/zip" })
}

function csvEscape(value: string | number) {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text
}

function csv(headers: string[], rows: Array<Array<string | number>>) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n")
}

function seriesCsv(seriesBy: SeriesBy) {
  const dates = seriesBy.visitors.map((p) => p.date)
  return csv(
    ["date", "visitors", "pageviews", "visits", "views_per_visit", "bounce_rate", "visit_duration"],
    dates.map((date, i) => [
      date,
      seriesBy.visitors[i]?.value ?? 0,
      seriesBy.pageviews[i]?.value ?? 0,
      seriesBy.visits[i]?.value ?? 0,
      seriesBy.views_per_visit[i]?.value ?? 0,
      seriesBy.bounce_rate[i]?.value ?? 0,
      seriesBy.visit_duration[i]?.value ?? 0,
    ]),
  )
}

function rowsCsv(rows: Row[], headers = ["name", "visitors"]) {
  return csv(headers, rows.map((row) => [row.name, row.value]))
}

export function downloadDashboardZip(input: {
  domain: string
  from: string
  to: string
  seriesBy?: SeriesBy
  series?: Point[]
  sources?: Row[]
  pages?: Row[]
  entryPages?: Row[]
  exitPages?: Row[]
  browsers?: Row[]
  os?: Row[]
  devices?: Row[]
  countries?: Row[]
  regions?: Row[]
  cities?: Row[]
  channels?: Row[]
  utm?: Row[]
  utmMediums?: Row[]
  campaigns?: Row[]
  goals?: Array<{ display_name: string, visitors?: number }>
  overview?: Overview
}) {
  const seriesBy = input.seriesBy || {
    visitors: input.series || [],
    visits: [],
    pageviews: [],
    views_per_visit: [],
    bounce_rate: [],
    visit_duration: [],
  }
  const files = [
    { name: "visitors.csv", content: seriesCsv(seriesBy) },
    { name: "sources.csv", content: rowsCsv(input.sources || []) },
    { name: "pages.csv", content: rowsCsv(input.pages || []) },
    { name: "entry_pages.csv", content: rowsCsv(input.entryPages || []) },
    { name: "exit_pages.csv", content: rowsCsv(input.exitPages || []) },
    { name: "browsers.csv", content: rowsCsv(input.browsers || []) },
    { name: "operating_systems.csv", content: rowsCsv(input.os || []) },
    { name: "devices.csv", content: rowsCsv(input.devices || []) },
    { name: "countries.csv", content: rowsCsv(input.countries || []) },
    { name: "regions.csv", content: rowsCsv(input.regions || []) },
    { name: "cities.csv", content: rowsCsv(input.cities || []) },
    { name: "channels.csv", content: rowsCsv(input.channels || []) },
    { name: "utm_sources.csv", content: rowsCsv(input.utm || []) },
    { name: "utm_mediums.csv", content: rowsCsv(input.utmMediums || []) },
    { name: "utm_campaigns.csv", content: rowsCsv(input.campaigns || []) },
    { name: "conversions.csv", content: csv(["name", "visitors"], (input.goals || []).map((g) => [g.display_name, g.visitors || 0])) },
  ]
  const blob = zipStore(files)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `LiteStats export ${input.domain} ${input.from} to ${input.to} .zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
