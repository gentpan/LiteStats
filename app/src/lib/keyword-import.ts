import { z } from "zod"
import { isDateRange } from "./date-time"

export const KEYWORD_IMPORT_MAX_BYTES = 1024 * 1024
export const KEYWORD_IMPORT_MAX_ROWS = 5000
export type KeywordImportProvider = "google" | "bing"
export type KeywordImportRow = {
  query: string
  clicks: number | null
  impressions: number | null
  /** Fraction, rather than a percentage: 0.12 means 12%. */
  ctr: number | null
  position: number | null
}
export type KeywordImportSummary = {
  id: number
  provider: KeywordImportProvider
  from: string
  to: string
  rowCount: number
  importedAt: string
}
export type KeywordImportBatch = KeywordImportSummary & {rows: KeywordImportRow[]}

export const keywordImportInputSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  provider: z.enum(["google", "bing"]),
  from: z.string(),
  to: z.string(),
  csvText: z.string().min(1, "请选择 CSV 文件").max(KEYWORD_IMPORT_MAX_BYTES, "CSV 文件不能超过 1 MB"),
}).refine(input => isDateRange(input.from, input.to), {
  path: ["to"], message: "请选择有效的导出日期范围，结束日期不能早于开始日期",
})

type Field = keyof KeywordImportRow
const aliases: Record<Field, string[]> = {
  query: ["query", "queries", "top queries", "search query", "search queries", "keyword", "keywords", "search keyword", "search keywords", "关键词", "关键字", "搜索词", "查询", "热门查询", "热门查询字词", "查询字词", "搜索查询"],
  clicks: ["clicks", "click", "total clicks", "点击", "点击次数", "总点击次数", "点击数"],
  impressions: ["impressions", "impression", "total impressions", "展现", "展现量", "展示", "展示次数", "展示量", "展示数", "曝光次数", "曝光量", "总展示次数"],
  ctr: ["ctr", "avg ctr", "avg. ctr", "average ctr", "click through rate", "click-through rate", "clickthrough rate", "click through rate (%)", "ctr (%)", "avg ctr (%)", "avg. ctr (%)", "average ctr (%)", "点击率", "点击率(%)", "点击率（%）", "平均点击率", "平均点击率(%)"],
  position: ["position", "average position", "avg position", "avg. position", "average search position", "average impression position", "avg impression position", "avg. impression position", "排名", "平均排名", "平均位置", "平均展示位置", "展示位置"],
}
const normalizeHeader = (header: string) => header.trim().toLowerCase().replaceAll("（", "(").replaceAll("）", ")").replaceAll("％", "%")
  .replace(/\s+/g, " ").replace(/\s*\(\s*%\s*\)/g, " (%)")
const headerFields = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [normalizeHeader(name), field as Field] as const)))

function invalid(line: number, message: string): never {
  throw new Error(`CSV 第 ${line} 行：${message}`)
}

/** RFC 4180-style records, including CRLF, escaped quotes and quoted line breaks. */
function csvRecords(text: string) {
  const records: {line: number; cells: string[]}[] = []
  let cells: string[] = [], cell = "", state: "plain" | "quoted" | "closed" = "plain"
  let line = 1, recordLine = 1
  function finish() {
    cells.push(cell)
    if (cells.some(value => value.trim() !== "")) {
      records.push({line: recordLine, cells})
      if (records.length > KEYWORD_IMPORT_MAX_ROWS + 1) invalid(recordLine, `最多导入 ${KEYWORD_IMPORT_MAX_ROWS} 条关键词`)
    }
    cells = []; cell = ""; state = "plain"
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (state === "quoted") {
      if (char === '"') {
        if (text[index + 1] === '"') {cell += '"'; index++}
        else state = "closed"
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[index + 1] === "\n") index++
        cell += "\n"; line++
      } else cell += char
      continue
    }
    if (char === ",") {cells.push(cell); cell = ""; state = "plain"}
    else if (char === "\r" || char === "\n") {
      finish()
      if (char === "\r" && text[index + 1] === "\n") index++
      line++; recordLine = line
    } else if (char === '"') {
      if (state === "closed" || cell !== "") invalid(line, "引号格式错误，请重新导出标准 CSV 文件")
      state = "quoted"
    } else {
      if (state === "closed") invalid(line, "引号后只能是逗号或换行")
      cell += char
    }
  }
  if (state === "quoted") invalid(recordLine, "引号未闭合")
  finish()
  return records
}

const missing = new Set(["", "-", "—", "–", "~", "n/a", "na", "null"])
const metricLabels = {clicks: "点击次数", impressions: "展示次数", ctr: "点击率", position: "平均排名"}
function numeric(value: string | undefined, field: Exclude<Field, "query">, line: number, percentColumn = false): number | null {
  const trimmed = value?.trim() || ""
  if (missing.has(trimmed.toLowerCase())) return null
  const percent = field === "ctr" && /[%％]$/.test(trimmed)
  const raw = percent ? trimmed.slice(0, -1).trim() : trimmed
  // Only correctly grouped thousands separators are accepted, never locale-ambiguous decimals.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) invalid(line, `${metricLabels[field]}必须是有效的非负数字`)
  const isCount = field === "clicks" || field === "impressions"
  // Validate the decimal text before Number() can round a fractional count into an integer.
  if (isCount && raw.includes(".") && /[1-9]/.test(raw.split(".")[1])) invalid(line, `${metricLabels[field]}必须是整数`)
  const valueNumber = Number(raw.replaceAll(",", "")) / (percent || percentColumn ? 100 : 1)
  if (!Number.isFinite(valueNumber) || valueNumber > Number.MAX_SAFE_INTEGER) invalid(line, `${metricLabels[field]}超出可处理范围`)
  if (isCount && !Number.isSafeInteger(valueNumber)) invalid(line, `${metricLabels[field]}必须是整数`)
  if (field === "ctr" && valueNumber > 1) invalid(line, "点击率请使用 0–1 的小数或带 % 的百分比")
  // Official Search Console exports represent an unavailable rank as 0.
  if (field === "position" && valueNumber === 0) return null
  if (field === "position" && valueNumber < 1) invalid(line, "平均排名必须至少为 1；没有排名时请留空")
  return valueNumber
}

/** Parses text only; query values (including spreadsheet-like formulas) are never evaluated. */
export function parseKeywordCsv(csvText: string): KeywordImportRow[] {
  if (new TextEncoder().encode(csvText).byteLength > KEYWORD_IMPORT_MAX_BYTES) throw new Error("CSV 文件不能超过 1 MB")
  if (/[\u0000\uFFFD]/.test(csvText) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(csvText)) {
    throw new Error("CSV 编码无效，请使用 UTF-8 编码重新导出")
  }
  const records = csvRecords(csvText.replace(/^\uFEFF/, ""))
  const header = records.shift()
  if (!header) throw new Error("CSV 文件为空")
  const columns = new Map<Field, number>()
  header.cells.forEach((cell, index) => {
    const field = headerFields.get(normalizeHeader(cell))
    if (!field) return
    if (columns.has(field)) invalid(header.line, `表头重复：${cell.trim()}`)
    columns.set(field, index)
  })
  if (!columns.has("query")) invalid(header.line, "缺少关键词列（Query、Top queries、Keyword、查询或关键词）")
  if (columns.size === 1) invalid(header.line, "至少需要点击次数、展示次数、点击率或平均排名中的一列")
  if (!records.length) throw new Error("CSV 文件没有关键词数据")
  const seen = new Map<string, number>()
  return records.map(({line, cells}) => {
    if (cells.length !== header.cells.length) invalid(line, "列数与表头不一致；包含逗号的内容需要用双引号包裹")
    const query = cells[columns.get("query")!].trim().normalize("NFC")
    if (!query) invalid(line, "关键词不能为空")
    if (query.length > 2048) invalid(line, "关键词不能超过 2048 个字符")
    if (seen.has(query)) invalid(line, `关键词重复（首次出现于第 ${seen.get(query)} 行），请导出按关键词汇总的报表`)
    seen.set(query, line)
    const read = (field: Exclude<Field, "query">) => numeric(columns.has(field) ? cells[columns.get(field)!] : undefined, field, line,
      field === "ctr" && columns.has(field) && normalizeHeader(header.cells[columns.get(field)!]).includes("%"))
    const clicks = read("clicks"), impressions = read("impressions"), suppliedCtr = read("ctr"), position = read("position")
    if ([clicks, impressions, suppliedCtr, position].every(value => value === null)) invalid(line, "至少需要一项有效的关键词指标")
    if (clicks !== null && impressions !== null && clicks > impressions) invalid(line, "点击次数不能大于展示次数")
    // Prefer the exact totals over an export's rounded percentage. Unknown denominators stay unknown.
    const ctr = clicks !== null && impressions !== null ? (impressions > 0 ? clicks / impressions : null) : suppliedCtr
    return {query, clicks, impressions, ctr, position}
  })
}
