import { UIIcon } from "./UIIcon"
import { ActionButton } from "~/components/ActionButton"
import { Field, SettingsForm } from "./SettingsForm"
import { formatTimestamp } from "~/lib/format"
import { useT } from "~/lib/i18n"
import { useState } from "react"
import { Tile } from "~/components/ui"
import { backupSettingsFn, restoreBackupFn, runBackupFn, saveBackupFn, scanBackupFn } from "~/lib/actions"

type Settings = Awaited<ReturnType<typeof backupSettingsFn>>
type Manifest = Awaited<ReturnType<typeof scanBackupFn>>[number]

export function BackupPanel({ initial }: { initial: Settings }) {
  const { t, locale } = useT()
  const [form, setForm] = useState(initial)
  const [savedForm, setSavedForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const [scanned, setScanned] = useState(false)
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
    setSavedForm({...form})
    setMsg(t("备份设置已保存"))
  }

  return (
    <div>
      <SettingsForm onSubmit={async event=>{event.preventDefault();setBusy("save");try{await save()}finally{setBusy("")}}}>
      <Tile icon="cloud" brand={form.provider === "r2" ? "cloudflare" : undefined} id="storage" title={t("对象存储")} subtitle={t("只支持 Cloudflare R2 和 Amazon S3。新装系统填同一组地址后可以扫描并一键恢复。")}>
        <div className="settings-field-grid">
          <Field label={t("服务")}>
            <select className="input w-full" value={form.provider} onChange={(e) => set("provider", e.target.value as Settings["provider"])}>
              <option value="r2">Cloudflare R2</option>
              <option value="s3">Amazon S3</option>
            </select>
          </Field>
          <Field label="Endpoint">
            <input className="input w-full" value={form.endpoint} placeholder={form.provider === "r2" ? t("https://账号.r2.cloudflarestorage.com") : t("可留空，或填自定义 S3 地址")} onChange={(e) => set("endpoint", e.target.value)} />
          </Field>
          <Field label="Region">
            <input className="input w-full" value={form.region} placeholder={form.provider === "r2" ? "auto" : "ap-northeast-1"} onChange={(e) => set("region", e.target.value)} />
          </Field>
          <Field label="Bucket">
            <input className="input w-full" value={form.bucket} onChange={(e) => set("bucket", e.target.value)} />
          </Field>
          <Field label={t("前缀")}>
            <input className="input w-full" value={form.prefix} onChange={(e) => set("prefix", e.target.value)} />
          </Field>
          <Field label="Access Key">
            <input className="input w-full" autoComplete="off" name="s3-access-key" value={form.access_key} onChange={(e) => set("access_key", e.target.value)} />
          </Field>
          <Field wide label="Secret Key">
            <input className="input w-full" type="password" autoComplete="new-password" name="s3-secret-key" value={form.secret_key} onChange={(e) => set("secret_key", e.target.value)} />
          </Field>
        </div>
      </Tile>

      <Tile icon="clock" id="schedule" title={t("备份时间")} subtitle={t("会备份 PostgreSQL 站点/账号数据和 ClickHouse 访问事件。不是逐条实时复制，最短可按小时跑。")}>
        <div className="backup-schedule-grid">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />{t("启用定时备份")}</label>
          <label className="text-sm"><span className="settings-label">{t("备份频率")}</span><select aria-label={t("备份频率")} className="input" value={form.schedule} onChange={(e) => set("schedule", e.target.value as Settings["schedule"])}>
            <option value="off">{t("仅手动")}</option>
            <option value="hourly">{t("每小时")}</option>
            <option value="daily">{t("每天")}</option>
            <option value="weekly">{t("每周")}</option>
          </select></label>
          {form.schedule === "weekly" ? (
            <label className="text-sm"><span className="settings-label">{t("星期")}</span><select aria-label={t("星期")} className="input" value={form.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
              {[t("日"), t("一"), t("二"), t("三"), t("四"), t("五"), t("六")].map((d, i) => (
                <option key={d} value={i}>{t("周")}{d}</option>
              ))}
            </select></label>
          ) : null}
          {form.schedule === "daily" || form.schedule === "weekly" ? (
            <label className="text-sm"><span className="settings-label">{t("备份时间")}</span><input aria-label={t("备份时间")} className="input" type="time" value={`${String(form.hour).padStart(2, "0")}:${String(form.minute).padStart(2, "0")}`} onChange={(e) => {
              const [h, m] = e.target.value.split(":")
              set("hour", Number(h))
              set("minute", Number(m))
            }} /></label>
          ) : null}
        </div>
        <p className="backup-run-status">{t("上次：")} {form.last_run_at ? formatTimestamp(form.last_run_at, locale) : t("还没有")}
          {form.last_backup_id ? ` · ${form.last_backup_id}` : ""}
          {form.last_status ? ` · ${form.last_status}` : ""}
          {form.last_error ? ` · ${form.last_error}` : ""}
        </p>
        <div className="settings-actions">
          <ActionButton type="submit" className="btn btn-primary" disabled={!!busy}>{t("保存设置")}</ActionButton>
          <ActionButton
            type="button"
            className="btn btn-secondary"
            icon="refresh"
            disabled={!!busy || dirty}
            onClick={() => {
              setBusy("run")
              runBackupFn()
                .then((m) => setMsg(t("备份完成 {0}，事件 {1} 条", {0: m.id, 1: m.clickhouse.rows})))
                .catch((e) => setErr(e instanceof Error ? e.message : t("备份失败")))
                .finally(() => setBusy(""))
            }}
          >
            {busy === "run" ? t("备份中…") : t("立即备份")}
          </ActionButton>
        </div>
      </Tile>

      </SettingsForm>
      {dirty ? <p role="status" className="my-4 text-sm text-amber-600">{t("有未保存的设置，请先保存，再执行备份、扫描或恢复。")}</p> : null}
      <Tile icon="refresh" id="restore" title={t("扫描与恢复")} subtitle={t("新机器填好同一组 R2/S3 地址后点扫描，选一份备份即可恢复。恢复会覆盖当前数据库。")}>
        <div className="settings-toolbar">
          <ActionButton
            type="button"
            className="btn btn-secondary"
            icon="refresh"
            disabled={!!busy || dirty}
            onClick={() => {
              setBusy("scan")
              scanBackupFn({ data: {} })
                .then((rows) => {
                  setItems(rows)
                  setScanned(true)
                  setMsg(rows.length ? t("找到 {0} 份备份", {0: rows.length}) : t("这个桶里还没有 LiteStats 备份"))
                })
                .catch((e) => setErr(e instanceof Error ? e.message : t("扫描失败")))
                .finally(() => setBusy(""))
            }}
          >
            {busy === "scan" ? t("扫描中…") : t("扫描备份")}
          </ActionButton>
        </div>
        {items.length ? (
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {items.map((item) => (
              <li key={item.id} className="backup-result-row">
                <div>
                  <div className="font-medium text-gray-900">{item.id}</div>
                  <div className="text-gray-500">{formatTimestamp(item.createdAt, locale)} {t("{0} 条事件", {0: item.clickhouse.rows})}</div>
                </div>
                <ActionButton
                  type="button"
                  icon="refresh"
                  className="btn btn-danger"
                  disabled={!!busy || dirty}
                  onClick={() => {
                    if (!window.confirm(t("确认用 {0} 覆盖当前数据库？", {0: item.id}))) return
                    setBusy(item.id)
                    restoreBackupFn({ data: { id: item.id } })
                      .then(() => setMsg(t("已恢复 {0}，请刷新页面", {0: item.id})))
                      .catch((e) => setErr(e instanceof Error ? e.message : t("恢复失败")))
                      .finally(() => setBusy(""))
                  }}
                >
                  {busy === item.id ? t("恢复中…") : t("一键恢复")}
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : <div className="settings-empty"><UIIcon name="cloud" /><span>{scanned ? t("这个桶里还没有 LiteStats 备份") : t("扫描后将在这里显示可恢复的备份。")}</span></div>}
      </Tile>
      {msg ? <p role="status" className="settings-feedback">{msg}</p> : null}
      {err ? <p role="alert" className="settings-feedback is-error">{err}</p> : null}
    </div>
  )
}
