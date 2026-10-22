import { expect, test } from "bun:test"
import { createThemeUpdate } from "../src/lib/theme-update"

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return {promise, resolve, reject}
}

test("optimistic theme survives a page remount until saved profile loaders have refreshed", async () => {
  const save = deferred(), refresh = deferred()
  const calls: string[] = []
  const state = createThemeUpdate(async theme => {calls.push(theme); await save.promise}, async () => {calls.push("refresh"); await refresh.promise})
  let previousPage = 0, nextPage = 0
  const leavePage = state.subscribe(() => {previousPage++})
  const request = state.change("owner@example.com", "light", "dark")
  expect(state.getSnapshot()).toEqual({email: "owner@example.com", theme: "dark", pending: true, failed: false})
  expect(previousPage).toBe(1)
  leavePage()
  const leaveNextPage = state.subscribe(() => {nextPage++})
  expect(state.getSnapshot()?.theme).toBe("dark")
  await state.change("owner@example.com", "dark", "light")
  expect(calls).toEqual(["dark"])
  save.resolve()
  await save.promise
  await Promise.resolve()
  expect(calls).toEqual(["dark", "refresh"])
  expect(state.getSnapshot()?.pending).toBe(true)
  refresh.resolve()
  await request
  expect(state.getSnapshot()).toBeUndefined()
  expect(previousPage).toBe(1)
  expect(nextPage).toBe(1)
  leaveNextPage()
})

test("failed account save rolls back the currently mounted page and remains retryable", async () => {
  const saving = deferred()
  let refreshes = 0, notifications = 0
  const state = createThemeUpdate(() => saving.promise, async () => {refreshes++})
  const request = state.change("owner@example.com", "light", "dark")
  const unsubscribe = state.subscribe(() => {notifications++})
  saving.reject(new Error("offline"))
  await request
  expect(state.getSnapshot()).toEqual({email: "owner@example.com", theme: "light", pending: false, failed: true})
  expect(refreshes).toBe(0)
  expect(notifications).toBe(1)
  unsubscribe()
})

test("a refresh failure after a successful save keeps the saved theme instead of rolling it back", async () => {
  const calls: string[] = []
  const state = createThemeUpdate(async theme => {calls.push(theme)}, async () => {throw new Error("loader unavailable")})
  await state.change("owner@example.com", "light", "dark")
  expect(calls).toEqual(["dark"])
  expect(state.getSnapshot()).toEqual({email: "owner@example.com", theme: "dark", pending: false, failed: false})
})
