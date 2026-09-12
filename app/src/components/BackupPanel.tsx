import { useState } from "react"
import { Tile } from "~/components/ui"
import { backupSettingsFn, restoreBackupFn, runBackupFn, saveBackupFn, scanBackupFn } from "~/lib/actions"

type Settings = Awaited<ReturnType<typeof backupSettingsFn>>
type Manifest = Awaited<ReturnType<typeof scanBackupFn>>[number]

export function BackupPanel({ initial }: { initial: Settings }) {
  const [form, setForm] = useState(initial)
  const [items, setItems] = useState<Manifest[]>([])
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState("")

  function set(key: keyof Settings, value: string | number | boolean) {
    setForm((cur) => ({ ...cur, [key]: value } as Settings))
  }

  async function save() {
    setErr("")
    setMsg("")
    await saveBackupFn({
      data: {
        provider: form.provider,
        endpoint: form.endpoint,
        region: form.region,
        bucket: form.bucket,
        prefix: form.prefix,
        access_key: form.access_key,
        secret_key: form.secret_key,
        schedule: form.schedule,
        hour: Number(form.hour),
        minute: Number(form.minute),
        weekday: Number(form.weekday),
        enabled: form.enabled,
      },
    })
    setMsg("备份设置已保存")
  }

  return (
    <div>
      <Tile title="对象存储" subtitle="只支持 Cloudflare R2 和 Amazon S3。新装系统填同一组地址后可以扫描并一键恢复。">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">服务</span>
            <select className="input w-full" value={form.provider} onChange={(e) => set("provider", e.target.value as Settings["provider"])}>
              <option value="r2">Cloudflare R2</option>
              <option value="s3">Amazon S3</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Endpoint</span>
            <input className="input w-full" value={form.endpoint} placeholder={form.provider === "r2" ? "https://账号.r2.cloudflarestorage.com" : "可留空，或填自定义 S3 地址"} onChange={(e) => set("endpoint", e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Region</span>
            <input className="input w-full" value={form.region} placeholder={form.provider === "r2" ? "auto" : "ap-northeast-1"} onChange={(e) => set("region", e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Bucket</span>
            <input className="input w-full" value={form.bucket} onChange={(e) => set("bucket", e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">前缀</span>
            <input className="input w-full" value={form.prefix} onChange={(e) => set("prefix", e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Access Key</span>
            <input className="input w-full" value={form.access_key} onChange={(e) => set("access_key", e.target.value)} />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-gray-500">Secret Key</span>
            <input className="input w-full" type="password" value={form.secret_key} onChange={(e) => set("secret_key", e.target.value)} />
          </label>
        </div>
      </Tile>

      <Tile title="备份时间" subtitle="会备份 PostgreSQL 站点/账号数据和 ClickHouse 访问事件。不是逐条实时复制，最短可按小时跑。">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            启用定时备份
          </label>
          <select className="input" value={form.schedule} onChange={(e) => set("schedule", e.target.value as Settings["schedule"])}>
            <option value="off">仅手动</option>
            <option value="hourly">每小时</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
          {form.schedule === "weekly" ? (
            <select className="input" value={form.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
              {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
                <option key={d} value={i}>周{d}</option>
              ))}
            </select>
          ) : null}
          {form.schedule === "daily" || form.schedule === "weekly" ? (
            <input className="input w-28" type="time" value={`${String(form.hour).padStart(2, "0")}:${String(form.minute).padStart(2, "0")}`} onChange={(e) => {
              const [h, m] = e.target.value.split(":")
              set("hour", Number(h))
              set("minute", Number(m))
            }} />
          ) : null}
        </div>
        <p className="mt-3 text-sm text-gray-500">
          上次：{form.last_run_at ? new Date(form.last_run_at).toLocaleString() : "还没有"}
          {form.last_backup_id ? ` · ${form.last_backup_id}` : ""}
          {form.last_status ? ` · ${form.last_status}` : ""}
          {form.last_error ? ` · ${form.last_error}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => save().catch((e) => setErr(e instanceof Error ? e.message : "保存失败"))}>保存设置</button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy === "run"}
            onClick={() => {
              setBusy("run")
              runBackupFn()
                .then((m) => setMsg(`备份完成 ${m.id}，事件 ${m.clickhouse.rows} 条`))
                .catch((e) => setErr(e instanceof Error ? e.message : "备份失败"))
                .finally(() => setBusy(""))
            }}
          >
            {busy === "run" ? "备份中…" : "立即备份"}
          </button>
        </div>
      </Tile>

      <Tile title="扫描与恢复" subtitle="新机器填好同一组 R2/S3 地址后点扫描，选一份备份即可恢复。恢复会覆盖当前数据库。">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy === "scan"}
            onClick={() => {
              setBusy("scan")
              scanBackupFn({ data: {} })
                .then((rows) => {
                  setItems(rows)
                  setMsg(rows.length ? `找到 ${rows.length} 份备份` : "这个桶里还没有 LiteStats 备份")
                })
                .catch((e) => setErr(e instanceof Error ? e.message : "扫描失败"))
                .finally(() => setBusy(""))
            }}
          >
            {busy === "scan" ? "扫描中…" : "扫描备份"}
          </button>
        </div>
        {items.length ? (
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium text-gray-900">{item.id}</div>
                  <div className="text-gray-500">{new Date(item.createdAt).toLocaleString()} · 事件 {item.clickhouse.rows} 条</div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy === item.id}
                  onClick={() => {
                    if (!window.confirm(`确认用 ${item.id} 覆盖当前数据库？`)) return
                    setBusy(item.id)
                    restoreBackupFn({ data: { id: item.id } })
                      .then(() => setMsg(`已恢复 ${item.id}，请刷新页面`))
                      .catch((e) => setErr(e instanceof Error ? e.message : "恢复失败"))
                      .finally(() => setBusy(""))
                  }}
                >
                  {busy === item.id ? "恢复中…" : "一键恢复"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Tile>
      {msg ? <p className="text-sm text-indigo-600">{msg}</p> : null}
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  )
}
