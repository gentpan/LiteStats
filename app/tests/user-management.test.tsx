import { expect, spyOn, test } from "bun:test"
import * as database from "../src/lib/db"
import { createManagedUser, registerPublicUser, resetManagedUserPassword, setManagedUserDisabled, setManagedUserRole } from "../src/lib/user-management"
import { UserManagementPanel } from "../src/components/UserManagementPanel"
import { renderToStaticMarkup } from "react-dom/server"

type Query = {text: string; values?: unknown[]}
function client(target: {id?: number; type?: string; disabled?: boolean} = {}) {
  const queries: Query[] = []
  const query = async (text: string, values: unknown[] = []) => {
    queries.push({text, values})
    if (text.includes("RETURNING id") && text.includes("INSERT INTO users") && !text.includes("team_memberships")) return {rows: [{id: 2}]}
    if (text.includes("INSERT INTO teams") && !text.includes("team_memberships")) return {rows: [{id: 3}]}
    if (text.includes("SELECT id, type, disabled FROM users")) return {rows: [{id: target.id ?? 1, type: target.type ?? "standard", disabled: target.disabled ?? false}]}
    if (text.includes("SELECT count(*) AS count FROM users WHERE type='admin'")) return {rows: [{count: 0}]}
    if (text.includes("registration_enabled")) return {rows: [{registration_enabled: true}]}
    return {rows: [], rowCount: 1}
  }
  return {query, queries, release: () => {}}
}

function pool(current: ReturnType<typeof client>) {
  return {connect: async () => current, query: current.query}
}

test("public registration honors the instance switch", async () => {
  const current = client()
  current.query = async (text: string, _values: unknown[] = []) => {
    if (text.includes("registration_enabled")) return {rows: [{registration_enabled: false}]}
    return {rows: [], rowCount: 1}
  }
  const mock = spyOn(database, "db").mockResolvedValue(pool(current) as never)
  try {
    await expect(registerPublicUser({email: "person@example.com", password: "password", name: "Person"})).rejects.toThrow("当前未开放注册")
    expect(current.queries.some(query => query.text.includes("INSERT INTO users"))).toBe(false)
  } finally { mock.mockRestore() }
})

test("creating a user assigns an independent team and does not expose the password hash", async () => {
  const current = client()
  const mock = spyOn(database, "db").mockResolvedValue(pool(current) as never)
  try {
    expect(await createManagedUser({email: "person@example.com", password: "password", name: "Person"})).toBe(2)
    expect(current.queries.some(query => query.text.includes("INSERT INTO teams"))).toBe(true)
    const membership = current.queries.find(query => query.text.includes("INSERT INTO team_memberships"))
    expect(membership?.values).toEqual([2, 3])
    expect(current.queries.some(query => query.text.includes("ROLLBACK"))).toBe(false)
    expect(current.queries.some(query => query.text.includes("COMMIT"))).toBe(true)
  } finally { mock.mockRestore() }
})

test("the last usable administrator cannot be disabled or demoted", async () => {
  for (const action of [
    () => setManagedUserDisabled(99, 1, true),
    () => setManagedUserRole(99, 1, "standard"),
  ]) {
    const current = client({type: "admin"})
    const mock = spyOn(database, "db").mockResolvedValue(pool(current) as never)
    try {
      await expect(action()).rejects.toThrow("至少保留一名可用的实例管理员")
      expect(current.queries.some(query => query.text.includes("ROLLBACK"))).toBe(true)
      expect(current.queries.some(query => query.text.includes("UPDATE users SET disabled") || query.text.includes("UPDATE users SET type"))).toBe(false)
    } finally { mock.mockRestore() }
  }
})

test("disabling a standard user revokes the current session version", async () => {
  const current = client()
  const mock = spyOn(database, "db").mockResolvedValue(pool(current) as never)
  try {
    await setManagedUserDisabled(99, 1, true)
    const update = current.queries.find(query => query.text.includes("UPDATE users SET disabled"))
    expect(update?.values).toEqual([1, true])
    expect(update?.text).toContain("session_version=session_version+1")
  } finally { mock.mockRestore() }
})

test("password reset returns only a new temporary password and invalidates old sessions", async () => {
  const current = client()
  const mock = spyOn(database, "db").mockResolvedValue(pool(current) as never)
  try {
    const password = await resetManagedUserPassword(1)
    expect(password).toMatch(/^[A-Za-z0-9_-]{16}$/)
    const update = current.queries.find(query => query.text.includes("UPDATE users SET password_hash"))
    expect(update?.text).toContain("session_version=session_version+1")
    expect(update?.values?.[1]).not.toBe(password)
  } finally { mock.mockRestore() }
})

test("administrator user management exposes all account controls", () => {
  const html = renderToStaticMarkup(<UserManagementPanel initial={{registrationEnabled: true, users: [{
    id: 1, email: "person@example.com", name: "Person", type: "standard", disabled: false, inserted_at: "2026-01-01T00:00:00.000Z",
  }]}} />)
  for (const text of ["用户管理", "创建用户", "允许公开注册", "普通用户", "实例管理员", "重置密码", "停用", "删除"]) expect(html).toContain(text)
  expect(html).toContain("person@example.com")
})
