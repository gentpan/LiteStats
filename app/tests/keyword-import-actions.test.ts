import { expect, test } from "bun:test"
import { createKeywordImportHandlers } from "../src/lib/keyword-import-actions"
import type { KeywordImportBatch } from "../src/lib/keyword-import"

const input = {domain: "example.com", provider: "google", from: "2026-10-01", to: "2026-10-22", csvText: "Query,Clicks\nword,3"}
const batch: KeywordImportBatch = {id: 31, provider: "google", from: input.from, to: input.to, importedAt: "2026-10-22T12:00:00.000Z", rowCount: 1,
  rows: [{query: "word", clicks: 3, impressions: null, ctr: null, position: null}]}

function fixture(options: {role?: string; member?: boolean; signedIn?: boolean} = {}) {
  const calls: {access: string[]; saves: unknown[]; lists: unknown[]; reads: unknown[]} = {access: [], saves: [], lists: [], reads: []}
  const handlers = createKeywordImportHandlers({
    requireUser: async () => {if (options.signedIn === false) throw new Error("UNAUTH"); return {id: 7}},
    findSiteForUser: async (userId, domain, access) => {
      expect(userId).toBe(7); expect(domain).toBe(input.domain); calls.access.push(access)
      const role = options.role || "owner"
      return options.member === false || (access === "admin" && !["owner", "admin"].includes(role)) ? null : {id: 12, role}
    },
    save: async value => {calls.saves.push(value); return batch},
    list: async (...args) => {calls.lists.push(args); const {rows: _rows, ...summary} = batch; return [summary]},
    read: async (...args) => {calls.reads.push(args); return args[1] === batch.id ? batch : null},
  })
  return {handlers, calls}
}

test("import requires a site administrator and reparses CSV instead of trusting a client metric array", async () => {
  const {handlers, calls} = fixture()
  expect(await handlers.import({...input, rows: [{query: "injected", clicks: 9000}]})).toEqual(batch)
  expect(calls.access).toEqual(["admin"])
  expect(calls.saves).toEqual([{siteId: 12, userId: 7, provider: "google", from: input.from, to: input.to, rows: batch.rows}])
  await expect(handlers.import({...input, csvText: "Query,Clicks\nword,-1"})).rejects.toThrow("CSV 第 2 行")
  expect(calls.saves).toHaveLength(1)
})

test("read-only members may inspect imports but cannot upload or claim admin permissions", async () => {
  for (const role of ["viewer", "guest", "editor"]) {
    const {handlers, calls} = fixture({role})
    await expect(handlers.import(input)).rejects.toThrow("没有权限")
    const result = await handlers.list({domain: input.domain})
    expect(result.latest).toEqual(batch)
    expect(result.canManage).toBe(false)
    expect(calls.saves).toEqual([])
  }
})

test("non-members and signed-out users cannot obtain imported keywords even for public sites", async () => {
  for (const options of [{member: false}, {signedIn: false}]) {
    const {handlers, calls} = fixture(options)
    await expect(handlers.import(input)).rejects.toThrow()
    await expect(handlers.list({domain: input.domain})).rejects.toThrow()
    await expect(handlers.read({domain: input.domain, id: 31})).rejects.toThrow()
    expect(calls.saves).toEqual([]); expect(calls.lists).toEqual([]); expect(calls.reads).toEqual([])
  }
})

test("batch reads are scoped to the authorized site and reject missing or foreign ids", async () => {
  const {handlers, calls} = fixture()
  expect(await handlers.read({domain: input.domain, id: batch.id})).toEqual(batch)
  await expect(handlers.read({domain: input.domain, id: 900})).rejects.toThrow("不存在或不属于此站点")
  expect(calls.reads).toEqual([[12, 31], [12, 900]])
  await expect(handlers.read({domain: input.domain, id: 1.5})).rejects.toThrow()
  expect(calls.reads).toHaveLength(2)
})

test("list passes the provider filter and loads the newest batch without aggregating snapshots", async () => {
  const {handlers, calls} = fixture()
  const result = await handlers.list({domain: input.domain, provider: "google"})
  expect(calls.lists).toEqual([[12, "google"]])
  expect(calls.reads).toEqual([[12, 31]])
  expect(result.latest?.rows[0].clicks).toBe(3)
  expect(result.batches).toHaveLength(1)
  expect(result.canManage).toBe(true)
})
