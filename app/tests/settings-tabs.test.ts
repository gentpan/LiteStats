import { expect, test } from "bun:test"
import { ACCOUNT_TABS, SYSTEM_TABS, SITE_TABS, accountTab, siteTab } from "../src/lib/settings-tabs"

test("retired account tabs fall back to preferences while security and backup links survive", () => {
  for (const value of ["api-keys", "system/email", "system/telegram", "system/services", undefined, null]) {
    expect(accountTab(value)).toBe("preferences")
  }
  expect(accountTab("security")).toBe("security")
  expect(accountTab("backup")).toBe("system/backup")
  expect(accountTab("system/backup")).toBe("system/backup")
  expect(ACCOUNT_TABS.map(tab => tab.id)).toEqual(["preferences", "security"])
  expect(SYSTEM_TABS.map(tab => tab.id)).toEqual(["system/mapbox", "system/backup"])
})

test("old map and placeholder bookmarks fall back without hiding sharing or tracking settings", () => {
  for (const value of ["map", "shields", "shields/ip", "email-reports", "imports-exports", undefined]) {
    expect(siteTab(value)).toBe("general")
  }
  for (const tab of SITE_TABS) expect(siteTab(tab.id)).toBe(tab.id)
  expect(SITE_TABS.map(tab => tab.id)).toEqual(["general", "visibility", "installation", "integrations", "danger-zone"])
})
