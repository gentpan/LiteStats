import { expect, test } from "bun:test"
import { createUserMapStyleHandlers } from "../src/lib/map-style-actions"
import { MAPBOX_STYLES, type MapboxStyleId } from "../src/lib/mapbox-styles"

function handlers() {
  const calls: {userId: number; styleId: unknown}[] = []
  let authorized = true, userReads = 0, failSave = false
  const actions = createUserMapStyleHandlers({
    user: async () => {
      userReads++
      if (!authorized) throw new Error("请先登录")
      return {id: 7}
    },
    save: async (userId, styleId) => {
      if (failSave) throw new Error("save unavailable")
      calls.push({userId, styleId})
      return styleId as MapboxStyleId
    },
  })
  return {actions, calls, userReads: () => userReads, logout: () => {authorized = false}, failSave: () => {failSave = true}}
}

test("map-style updates always belong to the authenticated account and return the saved whitelist ID", async () => {
  const state = handlers()
  for (const style of MAPBOX_STYLES) expect(await state.actions.save({styleId: style.id})).toEqual({styleId: style.id})
  expect(state.calls).toEqual(MAPBOX_STYLES.map(style => ({userId: 7, styleId: style.id})))
  expect(state.userReads()).toBe(3)
})

test("each save resolves the current account instead of caching a previous session", async () => {
  let currentUserId = 7
  const records = new Map<number, MapboxStyleId>()
  const actions = createUserMapStyleHandlers({
    user: async () => ({id: currentUserId}),
    save: async (userId, styleId) => {
      records.set(userId, styleId as MapboxStyleId)
      return styleId as MapboxStyleId
    },
  })
  await actions.save({styleId: "dark-v11"})
  currentUserId = 99
  await actions.save({styleId: "streets-v12"})
  currentUserId = 7
  await actions.save({styleId: "standard"})
  expect(records).toEqual(new Map([[7, "standard"], [99, "streets-v12"]]))
})

test("clients cannot name another account, submit map URLs, or save styles while signed out", async () => {
  const state = handlers()
  for (const input of [
    {styleId: "standard", userId: 99},
    {styleId: "standard", user_id: 99},
    {styleId: "standard", token: "foreign-key"},
    {styleId: "__proto__"},
    {styleId: "mapbox://styles/foreign/custom"},
    {styleId: "https://attacker.invalid/style.json"},
    {styleId: ""}, {}, null,
  ]) await expect(state.actions.save(input)).rejects.toThrow()
  expect(state.userReads()).toBe(0)
  expect(state.calls).toHaveLength(0)
  state.logout()
  await expect(state.actions.save({styleId: "dark-v11"})).rejects.toThrow("请先登录")
  expect(state.userReads()).toBe(1)
  expect(state.calls).toHaveLength(0)
})

test("removed style IDs are rejected before authentication or persistence", async () => {
  const state = handlers()
  for (const styleId of ["standard-satellite", "satellite-streets-v12", "satellite-v9", "light-v11", "outdoors-v12", "navigation-day-v1", "navigation-night-v1"]) {
    await expect(state.actions.save({styleId})).rejects.toThrow("请选择有效的地图样式")
  }
  expect(state.userReads()).toBe(0)
  expect(state.calls).toHaveLength(0)
})

test("persistence errors are reported instead of presenting an unsaved choice as saved", async () => {
  const state = handlers()
  state.failSave()
  await expect(state.actions.save({styleId: "streets-v12"})).rejects.toThrow("save unavailable")
  expect(state.calls).toHaveLength(0)
})
