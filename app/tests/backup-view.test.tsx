import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import type { ComponentProps } from "react"
import { BackupPanel } from "../src/components/BackupPanel"
import { I18nProvider, translate } from "../src/lib/i18n"
import { publicBackupSettings } from "../src/lib/backup"
import UI_EN from "../src/lib/ui-en.json"

type Settings = ComponentProps<typeof BackupPanel>["initial"]

const initial: Settings = {
  provider: "r2", endpoint: "", region: "auto", bucket: "", prefix: "litestats",
  access_key: "", secret_key: "", hasAccessKey: false, hasSecretKey: false,
  has_keys: false, configured: false, scheduleTimezone: "UTC",
  schedule: "daily", hour: 3, minute: 0, weekday: 0, enabled: false,
  last_run_at: null, last_status: null, last_error: null, last_backup_id: null,
}

const saved: Settings = {
  ...initial, endpoint: "https://account.r2.cloudflarestorage.com", bucket: "backup-view-test",
  hasAccessKey: true, hasSecretKey: true, has_keys: true, configured: true,
}

function render(settings: Settings = initial, locale: "zh-CN" | "en" = "zh-CN") {
  return renderToStaticMarkup(<I18nProvider locale={locale}><BackupPanel initial={settings}/></I18nProvider>)
}

function buttonAttributes(html: string, label: string) {
  const match = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(item => item[2].includes(label))
  expect(match).toBeDefined()
  return match![1]
}

function inputAttributes(html: string, name: string) {
  const match = [...html.matchAll(/<input\b([^>]*)>/g)].find(item => item[1].includes(`name="${name}"`))
  expect(match).toBeDefined()
  return match![1]
}

test("an unconfigured backup view shows a clear empty state and prevents storage operations", () => {
  const html = render()
  expect(html).toContain("尚无成功备份")
  expect(html).toContain("尚未执行备份")
  expect(html).toContain("扫描后，这里会列出可恢复的备份。")
  expect(html).not.toMatch(/Unknown|未知|undefined|NaN/)
  for (const label of ["测试连接", "立即备份", "扫描备份"]) {
    expect(buttonAttributes(html, label)).toContain('disabled=""')
  }
  expect(html).not.toContain("恢复此备份")
  expect(html).toContain("恢复会覆盖当前数据库。请确认备份后再操作。")
})

test("saved credentials render as blank password inputs without exposing stored keys", () => {
  const settings = publicBackupSettings({
    ...saved, access_key: "AKIA_VIEW_TEST_ONLY", secret_key: "view-test-only-secret-marker",
  })
  const html = render(settings)
  expect(html).not.toContain("AKIA_VIEW_TEST_ONLY")
  expect(html).not.toContain("view-test-only-secret-marker")
  for (const [name, placeholder] of [["s3-access-key", "已保存的 Access Key ID"], ["s3-secret-key", "已保存的 Secret Access Key"]]) {
    const attrs = inputAttributes(html, name)
    expect(attrs).toContain('type="password"')
    expect(attrs).toContain('value=""')
    expect(attrs).toContain(`placeholder="${placeholder}"`)
    expect(attrs).not.toContain('required=""')
  }
  expect(html).toContain("已保存。留空保留，填写新值可替换。")
  for (const label of ["测试连接", "立即备份", "扫描备份"]) {
    expect(buttonAttributes(html, label)).not.toContain('disabled=""')
  }
})

test("manual, hourly, daily and weekly schedules show only relevant controls and the server timezone", () => {
  const manual = render({...saved, enabled: false, schedule: "daily"})
  expect(manual).toContain('<option value="off" selected="">仅手动</option>')
  expect(manual).not.toContain('type="time"')
  expect(manual).not.toContain("执行日期")

  const hourly = render({...saved, enabled: true, schedule: "hourly"})
  expect(hourly).toContain("距离上次成功备份满一小时后执行，后台每分钟检查一次。")
  expect(hourly).not.toContain('type="time"')

  const daily = render({...saved, enabled: true, schedule: "daily", hour: 7, minute: 5, scheduleTimezone: "Asia/Tashkent"})
  expect(daily).toContain('type="time"')
  expect(daily).toContain('value="07:05"')
  expect(daily).toContain("按服务器时区 Asia/Tashkent 执行。")
  expect(daily).not.toContain("执行日期")

  const weekly = render({...saved, enabled: true, schedule: "weekly", weekday: 3})
  expect(weekly).toContain("执行日期")
  expect(weekly).toContain('<option value="3" selected="">星期三</option>')
  expect(weekly).toContain('type="time"')
  expect(weekly).toContain("按服务器时区 UTC 执行。")
})

test("connection testing describes its limited read-only scope and incomplete saved configurations stay disabled", () => {
  const html = render(saved)
  expect(buttonAttributes(html, "测试连接")).toContain('type="button"')
  expect(html).toContain("测试当前填写的信息，不会保存设置或创建备份。")
  for (const settings of [
    {...saved, configured: false, hasSecretKey: false, has_keys: false},
    {...saved, configured: false, endpoint: ""},
    {...saved, configured: false, bucket: ""},
  ]) {
    const incomplete = render(settings)
    for (const label of ["测试连接", "立即备份", "扫描备份"]) {
      expect(buttonAttributes(incomplete, label)).toContain('disabled=""')
    }
  }
})

test("backup metadata and errors are escaped and status codes are translated into useful labels", () => {
  const html = render({...saved,
    last_run_at: "2026-10-22T10:20:30Z", last_status: "error",
    last_backup_id: '<img src=x onerror="alert(1)">',
    last_error: '<script>alert("metadata")</script>',
  })
  expect(html).toContain("2026/10/22 10:20:30 UTC")
  expect(html).toContain("最近一次备份失败")
  expect(html).toContain("最近一次错误：&lt;script&gt;")
  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  expect(html).not.toContain("<script>")
  expect(html).not.toContain('<img src=x onerror="alert(1)">')
  for (const status of ["manual", "schedule"]) {
    const successful = render({...saved, last_run_at: "2026-10-22T10:20:30Z", last_status: status})
    expect(successful).toContain("备份成功")
    expect(successful).not.toContain(`>${status}<`)
  }
})

test("all backup field, status and connection error messages have English translations", () => {
  for (const file of ["components/BackupPanel.tsx", "lib/backup-connection.ts"]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
    for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
      if (!/[\u4e00-\u9fff]/.test(match[1])) continue
      const label = JSON.parse(match[0]) as string
      expect(Object.hasOwn(UI_EN, label)).toBe(true)
      expect(translate("en", label)).not.toMatch(/[\u4e00-\u9fff]/)
    }
  }
  const html = render({...saved, enabled: true, schedule: "weekly"}, "en")
  expect(html).toContain("Test connection")
  expect(html).toContain("Runs in the server timezone: UTC.")
  expect(html).not.toMatch(/[\u4e00-\u9fff]/)
})
