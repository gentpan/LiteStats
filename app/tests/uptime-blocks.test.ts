import { expect, test } from "bun:test"
import { buildUptimeBlocks } from "../src/lib/monitor-view"

test("buildUptimeBlocks creates 30, 60, and 90 blocks with accurate status and labels", () => {
  const now = Date.now()
  const boot5DaysAgo = now - 5 * 86_400_000
  const recentSeen = new Date().toISOString()

  const blocks30 = buildUptimeBlocks(boot5DaysAgo, recentSeen, 30, "zh-CN")
  expect(blocks30.length).toBe(30)

  // Last block is today
  const todayBlock = blocks30[29]
  expect(todayBlock.dateLabel).toBe("今天")
  expect(todayBlock.status).toBe("ok")
  expect(todayBlock.statusLabel).toBe("在线 100%")

  // Yesterday block
  const yesterdayBlock = blocks30[28]
  expect(yesterdayBlock.dateLabel).toBe("昨天")
  expect(yesterdayBlock.status).toBe("ok")

  // Block from 20 days ago (before boot time) should be "none"
  const pastBlock = blocks30[0]
  expect(pastBlock.status).toBe("none")

  // Test 60 and 90 counts
  expect(buildUptimeBlocks(boot5DaysAgo, recentSeen, 60).length).toBe(60)
  expect(buildUptimeBlocks(boot5DaysAgo, recentSeen, 90).length).toBe(90)
})

test("buildUptimeBlocks marks today as down when server is offline", () => {
  const now = Date.now()
  const boot5DaysAgo = now - 5 * 86_400_000
  const oldSeen = new Date(now - 30 * 60_000).toISOString() // 30 minutes ago -> offline

  const blocks = buildUptimeBlocks(boot5DaysAgo, oldSeen, 30, "zh-CN")
  const todayBlock = blocks[29]
  expect(todayBlock.status).toBe("down")
  expect(todayBlock.statusLabel).toBe("离线")
})

test("buildUptimeBlocks supports English locale labels", () => {
  const now = Date.now()
  const boot5DaysAgo = now - 5 * 86_400_000
  const recentSeen = new Date().toISOString()

  const blocks = buildUptimeBlocks(boot5DaysAgo, recentSeen, 30, "en")
  expect(blocks[29].dateLabel).toBe("Today")
  expect(blocks[28].dateLabel).toBe("Yesterday")
  expect(blocks[29].statusLabel).toBe("Online 100%")
})
