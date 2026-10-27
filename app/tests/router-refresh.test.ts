import { expect, mock, test } from "bun:test"
import { startRouterRefresh } from "../src/lib/router-refresh"

function scheduler() {
  let callback: (() => void) | undefined
  const clear = mock(() => {})
  return {
    callback: () => callback?.(),
    clear,
    scheduler: {
      setInterval: mock((fn: () => void, _ms: number) => { callback = fn; return 1 }),
      clearInterval: clear,
    },
  }
}

test("route refresh runs every 30 seconds only while the page is visible", () => {
  const refresh = mock(async () => {})
  const {callback, scheduler: timers} = scheduler()
  const visibility = {visibilityState: "visible" as DocumentVisibilityState}
  const stop = startRouterRefresh(refresh, {scheduler: timers, visibility})
  expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 30_000)
  callback()
  expect(refresh).toHaveBeenCalledTimes(1)
  visibility.visibilityState = "hidden"
  callback()
  expect(refresh).toHaveBeenCalledTimes(1)
  stop()
  expect(timers.clearInterval).toHaveBeenCalledWith(1)
  visibility.visibilityState = "visible"
  callback()
  expect(refresh).toHaveBeenCalledTimes(1)
})

test("route refresh never overlaps and recovers after a failure", async () => {
  let finish: () => void
  const first = new Promise<void>(resolve => { finish = () => resolve() })
  const refresh = mock(() => first)
  const onError = mock(() => {})
  const {callback, scheduler: timers} = scheduler()
  startRouterRefresh(refresh, {scheduler: timers, visibility: {visibilityState: "visible"}, onError})
  callback()
  callback()
  expect(refresh).toHaveBeenCalledTimes(1)
  finish!()
  await first
  await Promise.resolve()
  refresh.mockRejectedValueOnce(new Error("failed"))
  callback()
  await Promise.resolve()
  await Promise.resolve()
  expect(onError).toHaveBeenCalledTimes(1)
  callback()
  expect(refresh).toHaveBeenCalledTimes(3)
})
