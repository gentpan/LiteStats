import { expect, test } from "bun:test"
import type pg from "pg"
import { createKeywordImportStore } from "../src/lib/keyword-import-store"
import type { KeywordImportRow } from "../src/lib/keyword-import"

const input = {siteId: 12, userId: 7, provider: "google" as const, from: "2026-10-01", to: "2026-10-22",
  rows: [{query: 'literal "; DELETE FROM sites; --', clicks: 3, impressions: 10, ctr: 0.3, position: 2}]}

/** Models the SQL boundary only; it never connects to a database or reads credentials. */
function database() {
  const records: {id: number; siteId: number; provider: string; from: string; to: string; rows: KeywordImportRow[]; rowCount: number; importedAt: Date}[] = []
  const calls: {sql: string; values: unknown[]}[] = []
  let released = 0, failSchema = false, failInsert = false
  async function query(raw: string, values: unknown[] = []) {
    const sql = raw.trim().replace(/\s+/g, " ")
    calls.push({sql, values})
    if (sql.startsWith("CREATE TABLE")) {
      if (failSchema) {failSchema = false; throw new Error("schema temporarily unavailable")}
      return {rows: []}
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT pg_advisory_xact_lock") || sql.startsWith("CREATE INDEX")) return {rows: []}
    if (sql.startsWith("INSERT INTO site_keyword_imports")) {
      if (failInsert) {failInsert = false; throw new Error("insert temporarily unavailable")}
      expect(sql).not.toContain("ON CONFLICT")
      const record = {id: records.length + 1, siteId: Number(values[0]), provider: String(values[1]), from: String(values[2]), to: String(values[3]),
        rows: JSON.parse(String(values[4])), rowCount: Number(values[5]), importedAt: new Date("2026-10-22T12:00:00.000Z")}
      records.push(record)
      const {rows: _rows, siteId: _siteId, ...summary} = record
      return {rows: [summary]}
    }
    if (sql.includes("FROM site_keyword_imports") && sql.includes("AND id = $2")) {
      expect(sql).toContain("WHERE site_id = $1 AND id = $2")
      const record = records.find(row => row.siteId === values[0] && row.id === values[1])
      if (!record) return {rows: []}
      const {siteId: _siteId, ...batch} = record
      return {rows: [batch]}
    }
    if (sql.includes("FROM site_keyword_imports")) {
      expect(sql).toContain("WHERE site_id = $1 AND ($2::text IS NULL OR provider = $2)")
      expect(sql).toContain("ORDER BY imported_at DESC, id DESC LIMIT 30")
      return {rows: records.filter(row => row.siteId === values[0] && (!values[1] || row.provider === values[1])).slice().reverse().slice(0, 30)
        .map(({rows: _rows, siteId: _siteId, ...summary}) => summary)}
    }
    throw new Error(`Unexpected mock SQL: ${sql}`)
  }
  const pool = {query, connect: async () => ({query, release: () => {released++}})} as unknown as pg.Pool
  return {pool, records, calls, released: () => released, failSchemaOnce: () => {failSchema = true}, failInsertOnce: () => {failInsert = true}}
}

test("import storage preserves independent overlapping snapshots and parameterizes literal keyword text", async () => {
  const memory = database()
  const store = createKeywordImportStore(async () => memory.pool)
  const first = await store.save(input)
  const second = await store.save({...input, rows: [{...input.rows[0], clicks: 4, ctr: 0.4}]})
  expect(first.id).not.toBe(second.id)
  expect((await store.read(12, first.id))?.rows[0].clicks).toBe(3)
  expect((await store.read(12, second.id))?.rows[0].clicks).toBe(4)
  expect(memory.records).toHaveLength(2)
  const inserts = memory.calls.filter(call => call.sql.startsWith("INSERT"))
  expect(inserts.every(call => !call.sql.includes(input.rows[0].query))).toBe(true)
  expect(JSON.parse(String(inserts[0].values[4]))).toEqual(input.rows)
  expect(inserts[0].values[6]).toBe(input.userId)
  expect(memory.calls.some(call => /^(UPDATE|DELETE|DROP)\b/.test(call.sql))).toBe(false)
})

test("list and detail storage isolate sites and providers, including identical import timestamps", async () => {
  const memory = database()
  const store = createKeywordImportStore(async () => memory.pool)
  const google = await store.save(input)
  const bing = await store.save({...input, provider: "bing"})
  const other = await store.save({...input, siteId: 99})
  expect((await store.list(12)).map(batch => batch.id)).toEqual([bing.id, google.id])
  expect((await store.list(12, "google")).map(batch => batch.id)).toEqual([google.id])
  expect(await store.read(12, other.id)).toBeNull()
  expect(await store.read(99, google.id)).toBeNull()
  expect(await store.list(100)).toEqual([])
})

test("concurrent import operations share a transaction-protected schema initialization", async () => {
  const memory = database()
  const store = createKeywordImportStore(async () => memory.pool)
  await Promise.all([store.list(12), store.list(99), store.save(input)])
  expect(memory.calls.filter(call => call.sql === "BEGIN")).toHaveLength(1)
  expect(memory.calls.filter(call => call.sql.includes("pg_advisory_xact_lock"))).toHaveLength(1)
  expect(memory.calls.filter(call => call.sql === "COMMIT")).toHaveLength(1)
  expect(memory.calls.filter(call => call.sql === "ROLLBACK")).toHaveLength(0)
  expect(memory.released()).toBe(1)
})

test("failed schema initialization rolls back, releases its client and retries on the next operation", async () => {
  const memory = database()
  const store = createKeywordImportStore(async () => memory.pool)
  memory.failSchemaOnce()
  await expect(store.save(input)).rejects.toThrow("schema temporarily unavailable")
  expect(memory.records).toHaveLength(0)
  expect(memory.calls.filter(call => call.sql === "ROLLBACK")).toHaveLength(1)
  expect(memory.released()).toBe(1)
  expect((await store.save(input)).rows).toEqual(input.rows)
  expect(memory.calls.filter(call => call.sql === "BEGIN")).toHaveLength(2)
  expect(memory.calls.filter(call => call.sql === "COMMIT")).toHaveLength(1)
  expect(memory.released()).toBe(2)
})

test("an insert failure leaves earlier keyword snapshots readable and unchanged", async () => {
  const memory = database()
  const store = createKeywordImportStore(async () => memory.pool)
  const original = await store.save(input)
  memory.failInsertOnce()
  await expect(store.save({...input, from: "2026-10-10"})).rejects.toThrow("insert temporarily unavailable")
  expect(memory.records).toHaveLength(1)
  expect(await store.read(input.siteId, original.id)).toEqual(original)
  expect(await store.list(input.siteId)).toHaveLength(1)
})
