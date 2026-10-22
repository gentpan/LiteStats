import { expect, test } from "bun:test"
import type pg from "pg"
import { createUserMapStyleStore, rootMapStylePreference } from "../src/lib/map-style-settings"
import { MAPBOX_STYLES } from "../src/lib/mapbox-styles"

const removedStyles = ["standard-satellite", "satellite-streets-v12", "satellite-v9", "light-v11", "outdoors-v12", "navigation-day-v1", "navigation-night-v1"]

/** An in-memory SQL boundary: no database, credentials, network or historical records. */
function database() {
  const records = new Map<number, string>()
  const calls: {sql: string; values: unknown[]}[] = []
  let released = 0, failSchema = false, failConnect = false, failSave = false
  async function query(raw: string, values: unknown[] = []) {
    const sql = raw.trim().replace(/\s+/g, " ")
    calls.push({sql, values})
    if (sql.startsWith("CREATE TABLE")) {
      if (failSchema) { failSchema = false; throw new Error("temporary schema failure") }
      return {rows: []}
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT pg_advisory_xact_lock")) return {rows: []}
    if (sql.startsWith("SELECT style_id")) return {rows: records.has(Number(values[0])) ? [{style_id: records.get(Number(values[0]))}] : []}
    if (sql.startsWith("INSERT INTO user_mapbox_preferences")) {
      if (failSave) { failSave = false; throw new Error("temporary preference failure") }
      records.set(Number(values[0]), String(values[1]))
      return {rows: []}
    }
    throw new Error(`Unexpected mock SQL: ${sql}`)
  }
  const pool = {query, connect: async () => {
    if (failConnect) { failConnect = false; throw new Error("temporary connection failure") }
    return {query, release: () => {released++}}
  }} as unknown as pg.Pool
  return {pool, records, calls, released: () => released,
    failSchemaOnce: () => {failSchema = true}, failConnectOnce: () => {failConnect = true}, failSaveOnce: () => {failSave = true}}
}

test("absent or obsolete account styles read as Standard without creating or rewriting preferences", async () => {
  const memory = database()
  memory.records.set(8, "obsolete-map-style")
  const store = createUserMapStyleStore(async () => memory.pool)
  expect(await store.get(7)).toBe("standard")
  expect(await store.get(8)).toBe("standard")
  expect(memory.records.size).toBe(1)
  expect(memory.records.get(8)).toBe("obsolete-map-style")
  expect(memory.calls.some(call => /^(INSERT|UPDATE|DELETE|DROP|ALTER)\b/.test(call.sql))).toBe(false)
})

test("all seven removed styles fall back to Standard without rewriting saved account preferences", async () => {
  const memory = database()
  removedStyles.forEach((styleId, index) => memory.records.set(index + 1, styleId))
  const original = new Map(memory.records)
  const store = createUserMapStyleStore(async () => memory.pool)
  for (const id of original.keys()) expect(await store.get(id)).toBe("standard")
  expect(memory.records).toEqual(original)
  expect(memory.calls.some(call => /^(INSERT|UPDATE|DELETE|DROP|ALTER)\b/.test(call.sql))).toBe(false)
})

test("all three allowed styles persist independently per account using a parameterized preference upsert", async () => {
  const memory = database()
  const store = createUserMapStyleStore(async () => memory.pool)
  await store.save(99, "dark-v11")
  expect(MAPBOX_STYLES.map(style => style.id).sort()).toEqual(["dark-v11", "standard", "streets-v12"])
  for (const style of MAPBOX_STYLES) {
    expect(await store.save(7, style.id)).toBe(style.id)
    expect(await store.get(7)).toBe(style.id)
    expect(await store.get(99)).toBe("dark-v11")
  }
  expect(memory.records.size).toBe(2)
  const inserts = memory.calls.filter(call => call.sql.startsWith("INSERT"))
  expect(inserts).toHaveLength(4)
  expect(inserts[0]?.values).toEqual([99, "dark-v11"])
  expect(inserts.every(call => call.sql.includes("VALUES ($1, $2)") && call.sql.includes("ON CONFLICT (user_id) DO UPDATE") && call.sql.includes("updated_at=now()"))).toBe(true)
  expect(memory.calls.every(call => !/\b(site_map_settings|litestats_mapbox_settings|mapbox_token|api_key)\b/.test(call.sql))).toBe(true)
  expect(memory.calls.some(call => /^(DELETE|DROP|ALTER)\b/.test(call.sql))).toBe(false)
})

test("invalid style IDs and invalid account IDs fail before any database access", async () => {
  let accessed = 0
  const memory = database()
  const store = createUserMapStyleStore(async () => { accessed++; return memory.pool })
  for (const value of [undefined, null, "", "STANDARD", "__proto__", "constructor", "mapbox://styles/foreign/custom", "https://attacker.invalid/style.json", "standard'; DELETE FROM users; --", {styleId: "standard"}]) {
    await expect(store.save(7, value)).rejects.toThrow("请选择有效的地图样式")
  }
  for (const id of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(store.save(id, "standard")).rejects.toThrow()
    await expect(store.get(id)).rejects.toThrow()
  }
  expect(accessed).toBe(0)
  expect(memory.calls).toHaveLength(0)
})

test("removed styles cannot be saved and validation never accesses the database", async () => {
  const memory = database()
  memory.records.set(7, "dark-v11")
  let accessed = 0
  const store = createUserMapStyleStore(async () => { accessed++; return memory.pool })
  for (const styleId of removedStyles) await expect(store.save(7, styleId)).rejects.toThrow("请选择有效的地图样式")
  expect(accessed).toBe(0)
  expect(memory.calls).toHaveLength(0)
  expect(memory.records.get(7)).toBe("dark-v11")
})

test("simultaneous reads and writes share transaction-protected schema initialization", async () => {
  const memory = database()
  const store = createUserMapStyleStore(async () => memory.pool)
  await Promise.all([store.get(7), store.get(8), store.save(9, "streets-v12")])
  expect(memory.calls.filter(call => call.sql === "BEGIN")).toHaveLength(1)
  const lock = memory.calls.findIndex(call => call.sql.startsWith("SELECT pg_advisory_xact_lock"))
  const ddl = memory.calls.findIndex(call => call.sql.startsWith("CREATE TABLE"))
  expect(lock).toBeGreaterThan(0)
  expect(lock).toBeLessThan(ddl)
  expect(memory.calls[lock]?.values).toEqual(["litestats:user-mapbox-preferences:schema"])
  expect(memory.calls[ddl]?.sql).toContain("user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE")
  for (const style of MAPBOX_STYLES) expect(memory.calls[ddl]?.sql).toContain(`'${style.id}'`)
  expect(memory.calls.filter(call => call.sql === "COMMIT")).toHaveLength(1)
  expect(memory.calls.filter(call => call.sql === "ROLLBACK")).toHaveLength(0)
  expect(memory.released()).toBe(1)
})

test("schema failures roll back, release the client and can retry without losing existing preferences", async () => {
  const memory = database()
  memory.records.set(99, "dark-v11")
  const store = createUserMapStyleStore(async () => memory.pool)
  memory.failSchemaOnce()
  await expect(store.save(7, "streets-v12")).rejects.toThrow("temporary schema failure")
  expect(memory.calls.filter(call => call.sql === "ROLLBACK")).toHaveLength(1)
  expect(memory.released()).toBe(1)
  expect(memory.records.get(99)).toBe("dark-v11")
  expect(memory.records.has(7)).toBe(false)
  expect(await store.save(7, "streets-v12")).toBe("streets-v12")
  expect(await store.get(99)).toBe("dark-v11")
  expect(memory.calls.filter(call => call.sql === "BEGIN")).toHaveLength(2)
  expect(memory.released()).toBe(2)
})

test("a failed initial connection can retry and a failed save leaves the previous choice intact", async () => {
  const memory = database()
  const store = createUserMapStyleStore(async () => memory.pool)
  memory.failConnectOnce()
  await expect(store.get(7)).rejects.toThrow("temporary connection failure")
  expect(await store.save(7, "streets-v12")).toBe("streets-v12")
  expect(await store.save(99, "dark-v11")).toBe("dark-v11")
  memory.failSaveOnce()
  await expect(store.save(7, "standard")).rejects.toThrow("temporary preference failure")
  expect(await store.get(7)).toBe("streets-v12")
  expect(await store.get(99)).toBe("dark-v11")
  expect(memory.calls.filter(call => call.sql.startsWith("CREATE TABLE"))).toHaveLength(1)
  expect(memory.released()).toBe(1)
})

test("root preferences skip anonymous database reads and gracefully fall back without rewriting saved choices", async () => {
  const calls: number[] = []
  const read = async (userId: number) => { calls.push(userId); return "dark-v11" as const }
  expect(await rootMapStylePreference(null, read)).toBe("standard")
  expect(calls).toEqual([])
  expect(await rootMapStylePreference({id: 7}, read)).toBe("dark-v11")
  expect(calls).toEqual([7])

  const memory = database()
  memory.records.set(7, "dark-v11")
  const store = createUserMapStyleStore(async () => memory.pool)
  memory.failSchemaOnce()
  expect(await rootMapStylePreference({id: 7}, store.get)).toBe("standard")
  expect(memory.records.get(7)).toBe("dark-v11")
  expect(memory.calls.some(call => /^(INSERT|UPDATE|DELETE|DROP|ALTER)\b/.test(call.sql))).toBe(false)
  // The next request recovers the user's actual selection after a transient failure.
  expect(await rootMapStylePreference({id: 7}, store.get)).toBe("dark-v11")
})
