import { expect, test } from "bun:test"
import type pg from "pg"
import { createInstanceSetupStore, hasInstanceAdminAccess, InstanceAlreadyInitializedError } from "../src/lib/instance-setup"

type StoredUser = { id: number; email: string; name: string; password_hash: string; type: string; email_verified: boolean }
type Team = { id: number; name: string }
type Membership = { user_id: number; team_id: number; role: string }

/** Transactional SQL boundary with an exclusive lock queue and rollback. */
function memoryDatabase() {
  const state = {users: [] as StoredUser[], teams: [] as Team[], members: [] as Membership[]}
  const calls: {client: number; sql: string}[] = []
  let lock = Promise.resolve(), clients = 0, releases = 0, hashes = 0
  let failure: "user" | "team" | "membership" | "commit" | "hash" | undefined
  const pool = {
    async query(raw: string) {
      const sql = raw.trim().replace(/\s+/g, " ")
      calls.push({client: 0, sql})
      if (sql === "SELECT NOT EXISTS (SELECT 1 FROM users) AS needs_setup") return {rows: [{needs_setup: state.users.length === 0}]}
      throw new Error("Unexpected pool query")
    },
    async connect() {
      const id = ++clients
      let unlock: (() => void) | undefined
      let held = false
      let user: StoredUser | undefined, team: Team | undefined, membership: Membership | undefined
      return {
        async query(raw: string, values: unknown[] = []) {
          const sql = raw.trim().replace(/\s+/g, " ")
          calls.push({client: id, sql})
          if (sql.startsWith("BEGIN")) return {rows: []}
          if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
            const previous = lock
            lock = new Promise<void>(resolve => {unlock = resolve})
            await previous
            held = true
            return {rows: []}
          }
          if (sql === "ROLLBACK") {
            user = undefined; team = undefined; membership = undefined
            held = false; unlock?.(); unlock = undefined
            return {rows: []}
          }
          if (!held) throw new Error("Access before acquiring the transaction lock")
          if (sql === "SELECT count(*) AS user_count FROM users") return {rows: [{user_count: String(state.users.length)}]}
          if (sql.startsWith("INSERT INTO users")) {
            if (failure === "user") throw new Error("user failed")
            user = {id, email: String(values[0]), name: String(values[1]), password_hash: String(values[2]), type: "admin", email_verified: false}
            const {password_hash: _hash, ...publicUser} = user
            return {rows: [publicUser]}
          }
          if (sql.startsWith("INSERT INTO teams")) {
            if (failure === "team") throw new Error("team failed")
            team = {id, name: String(values[0])}
            return {rows: [{id}]}
          }
          if (sql.startsWith("INSERT INTO team_memberships")) {
            if (failure === "membership") throw new Error("membership failed")
            membership = {user_id: Number(values[0]), team_id: Number(values[1]), role: "owner"}
            return {rows: []}
          }
          if (sql === "COMMIT") {
            if (failure === "commit") throw new Error("commit failed")
            if (!user || !team || !membership) throw new Error("Incomplete account transaction")
            state.users.push(user); state.teams.push(team); state.members.push(membership)
            held = false; unlock?.(); unlock = undefined
            return {rows: []}
          }
          throw new Error("Unexpected transaction query")
        },
        release() {
          if (held || unlock) throw new Error("Connection released with an active transaction lock")
          releases++
        },
      }
    },
  } as unknown as pg.Pool
  return {state, calls, pool, releases: () => releases, hashes: () => hashes,
    failAt: (point: typeof failure) => {failure = point},
    hash: async (_password: string) => {hashes++; if (failure === "hash") throw new Error("hash failed"); return "private-password-hash"}}
}

const input = {email: "owner@example.invalid", password: "safe-password", name: "Owner"}

test("status exposes only whether users is empty; first account is admin and owns its team", async () => {
  const memory = memoryDatabase()
  const store = createInstanceSetupStore(async () => memory.pool, memory.hash)
  expect(await store.needsSetup()).toBe(true)
  const user = await store.create({...input, email: "  OWNER@example.invalid  "})
  expect(user).toEqual({id: 1, email: input.email, name: input.name, type: "admin", email_verified: false})
  expect(user).not.toHaveProperty("password_hash")
  expect(memory.state.users[0].password_hash).toBe("private-password-hash")
  expect(memory.state.members).toEqual([{role: "owner", user_id: user.id, team_id: memory.state.teams[0].id}])
  expect(await store.needsSetup()).toBe(false)
  expect(memory.releases()).toBe(1)
})

test("concurrent requests on independent stores create exactly one user, team and owner", async () => {
  const memory = memoryDatabase()
  const stores = Array.from({length: 8}, () => createInstanceSetupStore(async () => memory.pool, memory.hash))
  const results = await Promise.allSettled(stores.map((store, index) => store.create({...input, email: `owner-${index}@example.invalid`})))
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
  expect(results.filter(result => result.status === "rejected")).toHaveLength(7)
  for (const result of results) if (result.status === "rejected") expect(result.reason).toBeInstanceOf(InstanceAlreadyInitializedError)
  expect(memory.state.users).toHaveLength(1)
  expect(memory.state.teams).toHaveLength(1)
  expect(memory.state.members).toHaveLength(1)
  expect(memory.hashes()).toBe(1)
  expect(memory.releases()).toBe(8)
  for (const {client, sql} of memory.calls.filter(call => call.sql === "SELECT count(*) AS user_count FROM users")) {
    const clientCalls = memory.calls.filter(call => call.client === client).map(call => call.sql)
    expect(clientCalls[0]).toBe("BEGIN ISOLATION LEVEL READ COMMITTED")
    expect(clientCalls.findIndex(call => call.startsWith("SELECT pg_advisory_xact_lock"))).toBeLessThan(clientCalls.indexOf(sql))
  }
})

test("initialized and replayed requests leave existing credentials and roles unchanged", async () => {
  const memory = memoryDatabase()
  const store = createInstanceSetupStore(async () => memory.pool, memory.hash)
  await store.create(input)
  memory.state.users[0].type = "standard"
  memory.state.users[0].email_verified = true
  const before = structuredClone(memory.state)
  await expect(store.create({...input, password: "new-password"})).rejects.toBeInstanceOf(InstanceAlreadyInitializedError)
  await expect(store.create({...input, email: "another@example.invalid"})).rejects.toBeInstanceOf(InstanceAlreadyInitializedError)
  expect(memory.state).toEqual(before)
  expect(memory.hashes()).toBe(1)
})

test("hashing, user/team/member and commit failures roll back all records and allow retry", async () => {
  for (const point of ["hash", "user", "team", "membership", "commit"] as const) {
    const memory = memoryDatabase()
    const store = createInstanceSetupStore(async () => memory.pool, memory.hash)
    memory.failAt(point)
    await expect(store.create(input)).rejects.toThrow(`${point} failed`)
    expect(memory.state).toEqual({users: [], teams: [], members: []})
    expect(memory.releases()).toBe(1)
    expect(await store.needsSetup()).toBe(true)
    memory.failAt(undefined)
    await store.create(input)
    expect(await store.needsSetup()).toBe(false)
    expect(memory.state.users).toHaveLength(1)
    expect(memory.state.teams).toHaveLength(1)
    expect(memory.state.members).toHaveLength(1)
  }
})

test("invalid setup input is rejected before accessing a database", async () => {
  let accesses = 0
  const store = createInstanceSetupStore(async () => {accesses++; throw new Error("must not connect")})
  for (const invalid of [{...input, email: "broken"}, {...input, password: "short"}, {...input, name: "a".repeat(256)}, {...input, email: 3}, null]) {
    await expect(store.create(invalid)).rejects.toThrow()
  }
  expect(accesses).toBe(0)
})

test("bootstrap authority follows account identity; legacy allowlists require verified ownership", () => {
  expect(hasInstanceAdminAccess({type: "admin", email: "owner@example.invalid", email_verified: false}, [])).toBe(true)
  expect(hasInstanceAdminAccess({type: "admin", email: "changed@example.invalid", email_verified: false}, [])).toBe(true)
  expect(hasInstanceAdminAccess({type: "standard", email: "OWNER@example.invalid", email_verified: true}, [input.email])).toBe(true)
  expect(hasInstanceAdminAccess({type: "standard", email: input.email, email_verified: false}, [input.email])).toBe(false)
  expect(hasInstanceAdminAccess({type: "standard", email: "stranger@example.invalid", email_verified: true}, [input.email])).toBe(false)
  expect(hasInstanceAdminAccess({type: "standard", email: input.email, email_verified: true}, [])).toBe(false)
})
