import { expect, test } from "bun:test"
import { KEYWORD_IMPORT_MAX_BYTES, KEYWORD_IMPORT_MAX_ROWS, keywordImportInputSchema, parseKeywordCsv } from "../src/lib/keyword-import"

test("official Google CSV headers, BOM and rounded percentages preserve precise counts", () => {
  expect(parseKeywordCsv('\uFEFFTop queries,Clicks,Impressions,CTR,Position\r\nanalytics,3,11,27.27%,2.5\r\n')).toEqual([
    {query: "analytics", clicks: 3, impressions: 11, ctr: 3 / 11, position: 2.5},
  ])
})

test("Chinese and Bing header aliases accept correctly grouped thousands and quoted keywords", () => {
  expect(parseKeywordCsv('关键词,点击次数,展示次数,点击率,平均排名\n"统计,工具","1,234","12,340",10%,3')).toEqual([
    {query: "统计,工具", clicks: 1234, impressions: 12340, ctr: 0.1, position: 3},
  ])
  expect(parseKeywordCsv('Keyword,Clicks,Impressions,CTR,Avg. Position\nexample,0,5,0%,1')[0]).toEqual(
    {query: "example", clicks: 0, impressions: 5, ctr: 0, position: 1},
  )
})

test("quoted line breaks and escaped quotes remain literal text, including formula-looking queries", () => {
  const rows = parseKeywordCsv('Query,Clicks\n"first\r\nsecond ""phrase""",2\n"=HYPERLINK(""https://example.com"")",3')
  expect(rows.map(row => row.query)).toEqual(['first\nsecond "phrase"', '=HYPERLINK("https://example.com")'])
  expect(rows[1].clicks).toBe(3)
})

test("absent and blank values stay unknown; genuine zeros stay zero", () => {
  const rows = parseKeywordCsv('Query,Clicks,Impressions,CTR,Position\nmissing,,5,,\nzero,0,0,0%,\npartial,4,-,—,N/A')
  expect(rows).toEqual([
    {query: "missing", clicks: null, impressions: 5, ctr: null, position: null},
    {query: "zero", clicks: 0, impressions: 0, ctr: null, position: null},
    {query: "partial", clicks: 4, impressions: null, ctr: null, position: null},
  ])
  expect(parseKeywordCsv('Query,CTR\nfraction,0.2\npercent,20%\nfull,100％').map(row => row.ctr)).toEqual([0.2, 0.2, 1])
})

test("duplicate queries are rejected with physical line numbers, even after quoted newlines", () => {
  expect(() => parseKeywordCsv('Query,Clicks\n"multiline\ntext",1\nnormal,2\nnormal,3')).toThrow("CSV 第 5 行：关键词重复（首次出现于第 4 行）")
  expect(() => parseKeywordCsv('Query,Clicks\ncafé,1\ncafe\u0301,2')).toThrow("关键词重复")
})

test("invalid numbers cannot be truncated, converted to zero or interpreted as formulas", () => {
  for (const value of ["-1", "1x", "1e3", "+2", "NaN", "Infinity", "0x10", "=2", "1.2", "9007199254740992", '"1,23"']) {
    expect(() => parseKeywordCsv(`Query,Clicks\nword,${value}`)).toThrow("CSV 第 2 行")
  }
  for (const value of ["150%", "25", "-1%", "NaN"]) expect(() => parseKeywordCsv(`Query,CTR\nword,${value}`)).toThrow("CSV 第 2 行")
  expect(() => parseKeywordCsv('Query,Position\nword,0.5')).toThrow("至少为 1")
  expect(() => parseKeywordCsv('Query,Clicks,Impressions\nword,2,1')).toThrow("点击次数不能大于展示次数")
})

test("header and empty-metric errors explain what is missing", () => {
  expect(() => parseKeywordCsv('Page,Clicks\n/,1')).toThrow("缺少关键词列")
  expect(() => parseKeywordCsv('Query,Unknown\nword,1')).toThrow("至少需要点击次数")
  expect(() => parseKeywordCsv('Query,Clicks,点击数\nword,1,1')).toThrow("表头重复")
  expect(() => parseKeywordCsv('Query,Clicks\nword,')).toThrow("至少需要一项有效")
  expect(() => parseKeywordCsv('Query,Clicks\n,1')).toThrow("关键词不能为空")
  expect(() => parseKeywordCsv('Query,Clicks\n')).toThrow("没有关键词数据")
  expect(() => parseKeywordCsv('')).toThrow("文件为空")
})

test("extra unrelated columns are tolerated but broken CSV quoting is not", () => {
  expect(parseKeywordCsv('Query,Clicks,Country\nword,1,China')[0].clicks).toBe(1)
  for (const csv of ['Query,Clicks\nword,1,2', 'Query,Clicks\nword', 'Query,Clicks\n"word,1', 'Query,Clicks\nwo"rd,1', 'Query,Clicks\n"word"extra,1']) {
    expect(() => parseKeywordCsv(csv)).toThrow("CSV 第 2 行")
  }
})

test("UTF-8 byte size and row count limits are enforced before saving", () => {
  const tooBig = `Query,Clicks\n${"词".repeat(Math.ceil(KEYWORD_IMPORT_MAX_BYTES / 3))},1`
  expect(tooBig.length).toBeLessThan(KEYWORD_IMPORT_MAX_BYTES)
  expect(() => parseKeywordCsv(tooBig)).toThrow("不能超过 1 MB")
  const exactlyMax = "Query,Clicks\n" + Array.from({length: KEYWORD_IMPORT_MAX_ROWS}, (_, index) => `query${index},1`).join("\n")
  expect(parseKeywordCsv(exactlyMax)).toHaveLength(KEYWORD_IMPORT_MAX_ROWS)
  expect(() => parseKeywordCsv(exactlyMax + "\nextra,1")).toThrow("最多导入 5000 条")
  expect(() => parseKeywordCsv('Query,Clicks\ninvalid\uFFFD,1')).toThrow("UTF-8")
  expect(() => parseKeywordCsv('Query,Clicks\ninvalid\u0000,1')).toThrow("UTF-8")
})

test("import date ranges use real calendar dates and allow a single day", () => {
  const valid = {domain: "example.com", provider: "google", from: "2026-10-01", to: "2026-10-22", csvText: "Query,Clicks\nword,1"}
  expect(keywordImportInputSchema.safeParse(valid).success).toBe(true)
  expect(keywordImportInputSchema.safeParse({...valid, from: valid.to}).success).toBe(true)
  for (const patch of [{from: "2026-02-30"}, {to: "2026-09-30"}, {to: "2026-2-1"}, {from: "realtime"}, {provider: "other"}]) {
    expect(keywordImportInputSchema.safeParse({...valid, ...patch}).success).toBe(false)
  }
})

test("percentage-marked headers interpret bare values as percentages exactly once", () => {
  for (const header of ["CTR (%)", "CTR(%)", "Avg. CTR (%)", "平均点击率（％）", "点击率( % )"]) {
    expect(parseKeywordCsv(`Query,${header}\nsmall,0.8\nlarge,25\nexplicit,25%`).map(row => row.ctr)).toEqual([0.008, 0.25, 0.25])
  }
  expect(parseKeywordCsv('Keyword,Avg. CTR,Avg. Impression Position\nword,12%,4.5')[0]).toEqual({query: "word", clicks: null, impressions: null, ctr: 0.12, position: 4.5})
})

test("official exported zero rankings stay unknown while real zero counts are retained", () => {
  expect(parseKeywordCsv('Query,Clicks,Impressions,CTR,Position\nno impressions,0,0,0%,0\nunranked,0,10,0%,0')).toEqual([
    {query: "no impressions", clicks: 0, impressions: 0, ctr: null, position: null},
    {query: "unranked", clicks: 0, impressions: 10, ctr: 0, position: null},
  ])
})

test("count validation cannot silently round precision-heavy fractions to integers", () => {
  for (const field of ["clicks", "impressions"] as const) {
    for (const value of ["1.0000000000000000001", "9007199254740991.1", `0.${"0".repeat(350)}1`]) {
      expect(() => parseKeywordCsv(`Query,${field}\nword,${value}`)).toThrow("必须是整数")
    }
    expect(parseKeywordCsv(`Query,${field}\nword,1.0000000000000000000`)[0][field]).toBe(1)
  }
})

test("invalid Unicode is rejected before PostgreSQL jsonb, while valid emoji remain literal", () => {
  for (const value of ["\uD800", "\uDC00", "\uDC00\uD800"]) expect(() => parseKeywordCsv(`Query,Clicks\n${value},1`)).toThrow("UTF-8")
  expect(parseKeywordCsv('Query,Clicks\n📊 analytics,1')[0].query).toBe("📊 analytics")
})
