import { useState } from "react"
import { UIIcon } from "./UIIcon"
import { ActionButton } from "./ActionButton"
import { HelpHint } from "./HelpHint"
import { Field, SettingsForm } from "./SettingsForm"
import { Tile } from "./ui"
import { formatTimestamp } from "~/lib/format"
import { useT } from "~/lib/i18n"
import { backupSettingsFn, restoreBackupFn, runBackupFn, saveBackupFn, scanBackupFn, testBackupConnectionFn } from "~/lib/actions"
import "~/styles/backup-settings.css"

type Settings = Awaited<ReturnType<typeof backupSettingsFn>>
type Manifest = Awaited<ReturnType<typeof scanBackupFn>>[number]
type Connection = Awaited<ReturnType<typeof testBackupConnectionFn>>
const storageFields = new Set<keyof Settings>(["provider", "endpoint", "region", "bucket", "prefix", "access_key", "secret_key"])

export function BackupPanel({ initial }: { initial: Settings }) {
  const { t, locale } = useT()
  const [form, setForm] = useState(initial)
  const [savedForm, setSavedForm] = useState(initial)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [connectionError, setConnectionError] = useState("")
  const [scanned, setScanned] = useState(false)
  const [items, setItems] = useState<Manifest[]>([])
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState("")
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const frequency = form.enabled ? form.schedule : "off"
  const destinationChanged = (savedForm.hasAccessKey || savedForm.hasSecretKey) && (
    form.provider !== savedForm.provider || form.endpoint.trim().replace(/\/$/, "") !== savedForm.endpoint.trim().replace(/\/$/, "") ||
    (form.provider === "s3" && !form.endpoint.trim() && form.region !== savedForm.region)
  )
  const hasKeys = !!((form.access_key || (!destinationChanged && form.hasAccessKey)) && (form.secret_key || (!destinationChanged && form.hasSecretKey)))
  const ready = !!form.bucket.trim() && hasKeys && (form.provider !== "r2" || !!form.endpoint.trim()) && !!form.region.trim()

  function set(key: keyof Settings, value: string | number | boolean) {
    setMsg(""); setErr("")
    if (storageFields.has(key)) {
      setConnection(null); setConnectionError(""); setItems([]); setScanned(false)
    }
    setForm(cur => ({ ...cur, [key]: value,
      ...(key === "provider" ? {region: value === "r2" ? "auto" : cur.region === "auto" ? "" : cur.region} : {}),
    } as Settings))
  }

  function storageData() {
    return {provider: form.provider, endpoint: form.endpoint, region: form.region, bucket: form.bucket,
      prefix: form.prefix, access_key: form.access_key, secret_key: form.secret_key}
  }

  async function perform(kind: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(kind); setMsg(""); setErr("")
    try { await action() }
    catch (error) { setErr(error instanceof Error ? t(error.message) : t("操作失败，请重试")) }
    finally { setBusy("") }
  }

  async function save() {
    const result = await saveBackupFn({ data: {...storageData(), schedule: form.schedule,
      hour: form.hour, minute: form.minute, weekday: form.weekday, enabled: form.enabled} })
    setForm(result.settings); setSavedForm(result.settings)
    setMsg(t("备份设置已保存"))
  }

  const credentialHint = (saved: boolean) => destinationChanged
    ? t("更换服务或地址后，请重新填写密钥。")
    : saved ? t("已保存。留空保留，填写新值可替换。") : t("填写此存储桶对应的 API 密钥。")

  return <div className="backup-panel" aria-busy={!!busy}>
    <SettingsForm onSubmit={() => perform("save", save)}>
      <fieldset disabled={!!busy} className="backup-form-fields">
        <Tile icon="cloud" brand={form.provider === "r2" ? "cloudflare" : undefined} id="storage" title={t("对象存储")}>
          <div className="backup-fields">
            <Field label={t("存储服务")}>
              <select className="squircle input" value={form.provider} onChange={e => set("provider", e.target.value)}>
                <option value="r2">Cloudflare R2</option><option value="s3">Amazon S3</option>
              </select>
            </Field>
            <Field label={t("存储桶（Bucket）")} hint={t("填写已创建的桶名称，不含路径。") }>
              <input className="squircle input" required maxLength={63} value={form.bucket} placeholder="litestats-backups" autoCapitalize="none" spellCheck={false} onChange={e => set("bucket", e.target.value)}/>
            </Field>
            <Field wide label={t("服务地址（Endpoint）")} hint={form.provider === "r2" ? t("在 R2 存储桶概览中复制 S3 API 地址；不要填写公开访问域名。") : t("标准 Amazon S3 可留空；使用自定义地址时请填写完整的 HTTPS 地址。") }>
              <input className="squircle input" type="url" required={form.provider === "r2"} maxLength={2048} value={form.endpoint} placeholder={form.provider === "r2" ? "https://<ACCOUNT_ID>.r2.cloudflarestorage.com" : "https://s3.us-east-1.amazonaws.com"} autoCapitalize="none" spellCheck={false} onChange={e => set("endpoint", e.target.value)}/>
            </Field>
            <Field label={t("区域（Region）")}>
              <input className="squircle input" title={form.provider === "r2" ? t("R2 使用 auto，系统自动选择区域。") : t("填写存储桶所在的 AWS 区域，例如 us-east-1。") } required maxLength={64} readOnly={form.provider === "r2"} value={form.region} placeholder="us-east-1" spellCheck={false} onChange={e => set("region", e.target.value)}/>
            </Field>
            <Field label={t("备份目录前缀")}>
              <input className="squircle input" title={t("备份存放在此前缀下，留空使用 litestats。") } maxLength={512} value={form.prefix} placeholder="litestats" spellCheck={false} onChange={e => set("prefix", e.target.value)}/>
            </Field>
          </div>
          <div className="backup-credentials">
            <div className="flex items-center gap-2"><h3>{t("访问凭据")}</h3><HelpHint>{t("密钥加密保存在服务器，保存后不再显示原文。")}</HelpHint></div>
            {destinationChanged || (form.hasAccessKey && form.hasSecretKey) ? <p>{credentialHint(form.hasAccessKey && form.hasSecretKey)}</p> : null}
            <div className="backup-fields">
              <Field label="Access Key ID">
                <input className="squircle input" title={credentialHint(form.hasAccessKey)} type="password" required={!form.hasAccessKey || destinationChanged} maxLength={256} autoComplete="new-password" name="s3-access-key" value={form.access_key} placeholder={form.hasAccessKey && !destinationChanged ? t("已保存的 Access Key ID") : "Access Key ID"} spellCheck={false} onChange={e => set("access_key", e.target.value)}/>
              </Field>
              <Field label="Secret Access Key">
                <input className="squircle input" title={credentialHint(form.hasSecretKey)} type="password" required={!form.hasSecretKey || destinationChanged} maxLength={512} autoComplete="new-password" name="s3-secret-key" value={form.secret_key} placeholder={form.hasSecretKey && !destinationChanged ? t("已保存的 Secret Access Key") : "Secret Access Key"} spellCheck={false} onChange={e => set("secret_key", e.target.value)}/>
              </Field>
            </div>
          </div>
          <div className="backup-test-actions">
            <ActionButton icon="plug" disabled={!!busy || !ready} onClick={async () => {
              if (busy) return
              setBusy("test"); setConnection(null); setConnectionError(""); setMsg(""); setErr("")
              try { setConnection(await testBackupConnectionFn({data: storageData()})) }
              catch (error) { setConnectionError(error instanceof Error ? t(error.message) : t("连接测试失败，请重试")) }
              finally { setBusy("") }
            }}>{t(busy === "test" ? "测试中…" : "测试连接")}</ActionButton>
            <p>{t("测试当前填写的信息，不会保存设置或创建备份。")}</p>
          </div>
          {connection ? <div role="status" className="squircle backup-connection-result"><UIIcon name="check"/><div className="min-w-0"><strong>{t("连接成功，可以读取备份目录")}</strong><p>{t("已验证 {0} 的读取权限，未上传或删除文件。", {0: connection.bucket})}</p><p>{t("上传权限将在执行备份时验证。")}</p></div></div> : null}
          {connectionError ? <p role="alert" className="squircle settings-feedback is-error">{connectionError}</p> : null}
        </Tile>
        <Tile icon="clock" id="schedule" title={t("自动备份")}>
          <div className="backup-fields">
            <Field label={t("备份频率")} hint={frequency === "hourly" ? t("距离上次成功备份满一小时后执行，后台每分钟检查一次。") : undefined}>
              <select className="squircle input" title={t("选择“仅手动”可关闭自动备份。") } value={frequency} onChange={e => {
                setMsg(""); setErr(""); setForm(cur => ({...cur, schedule: e.target.value as Settings["schedule"], enabled: e.target.value !== "off"}))
              }}>
                <option value="off">{t("仅手动")}</option><option value="hourly">{t("每小时")}</option><option value="daily">{t("每天")}</option><option value="weekly">{t("每周")}</option>
              </select>
            </Field>
            {frequency === "weekly" ? <Field label={t("执行日期")}>
              <select className="squircle input" value={form.weekday} onChange={e => set("weekday", Number(e.target.value))}>
                {["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"].map((day, i) => <option key={day} value={i}>{t(day)}</option>)}
              </select>
            </Field> : null}
            {frequency === "daily" || frequency === "weekly" ? <Field label={t("执行时间")} hint={t("按服务器时区 {0} 执行。", {0: form.scheduleTimezone})}>
              <input className="squircle input" type="time" required value={String(form.hour).padStart(2, "0") + ":" + String(form.minute).padStart(2, "0")} onChange={e => {
                if (!/^\d{2}:\d{2}$/.test(e.target.value)) return
                const [hour, minute] = e.target.value.split(":").map(Number)
                setMsg(""); setErr(""); setForm(cur => ({...cur, hour, minute}))
              }}/>
            </Field> : null}
          </div>
          <div className="settings-actions backup-save-actions">
            <ActionButton type="submit" className="btn btn-primary" disabled={!!busy}>{t(busy === "save" ? "保存中…" : "保存设置")}</ActionButton>
            <span>{t(dirty ? "有未保存的修改" : "设置已保存")}</span>
          </div>
        </Tile>
      </fieldset>
    </SettingsForm>
    {msg ? <p role="status" className="squircle settings-feedback">{msg}</p> : null}
    {err ? <p role="alert" className="squircle settings-feedback is-error">{err}</p> : null}
    <Tile icon="shield" title={t("完整备份与迁移")}>
      <p className="settings-hint">{t("部署工具可生成一份加密备份，包含账号、站点、访问记录和运行配置。恢复时先校验并还原到新库，成功后切换，旧库保留。")}</p>
      <p className="settings-hint">{t("请将备份文件和恢复密钥分别妥善保存。")}</p>
      <a className="text-sm text-indigo-600" href="https://github.com/gentpan/LiteStats/blob/main/deploy/README.md" target="_blank" rel="noreferrer">{t("部署与恢复说明")}</a>
    </Tile>
    <Tile icon="cloud" id="restore" title={t("备份与恢复")}>
      <p className="settings-hint">{t("云端恢复期间会暂停采集与后台请求，并先自动保存当前数据。更换服务器请使用完整加密备份。")}</p>
      <dl className="squircle backup-status-grid">
        <div><dt>{t("上次成功备份")}</dt><dd>{form.last_run_at ? formatTimestamp(form.last_run_at, locale) : t("尚无成功备份")}</dd></div>
        <div><dt>{t("备份状态")}</dt><dd>{t(form.last_status === "error" ? "最近一次备份失败" : form.last_run_at ? "备份成功" : "尚未执行备份")}</dd></div>
        {form.last_backup_id ? <div className="backup-status-id"><dt>{t("备份编号")}</dt><dd>{form.last_backup_id}</dd></div> : null}
      </dl>
      {form.last_status === "error" && form.last_error ? <p className="squircle settings-feedback is-error">{t("最近一次错误：{0}", {0: form.last_error})}</p> : null}
      {dirty ? <p className="backup-unsaved-hint">{t("请先保存修改，再执行备份、扫描或恢复。连接测试可以直接使用当前填写的信息。")}</p> : null}
      <div className="backup-run-actions">
        <ActionButton icon="cloud" loading={busy === "run"} disabled={!!busy || dirty || !form.configured} onClick={() => perform("run", async () => {
          const manifest = await runBackupFn()
          const result = {last_run_at: manifest.createdAt, last_status: "manual", last_error: null, last_backup_id: manifest.id}
          setForm(cur => ({...cur, ...result})); setSavedForm(cur => ({...cur, ...result}))
          setMsg(t("备份完成 {0}，事件 {1} 条", {0: manifest.id, 1: manifest.clickhouse.rows}))
        })}>{t(busy === "run" ? "备份中" : "立即备份")}</ActionButton>
        <ActionButton icon="search" loading={busy === "scan"} disabled={!!busy || dirty || !form.configured} onClick={() => perform("scan", async () => {
          const rows = await scanBackupFn({data: {}})
          setItems(rows); setScanned(true)
          setMsg(rows.length ? t("找到 {0} 份备份", {0: rows.length}) : t("这个桶里还没有 LiteStats 备份"))
        })}>{t(busy === "scan" ? "扫描中" : "扫描备份")}</ActionButton>
      </div>
      {items.length ? <ul className="backup-result-list">
        {items.map(item => <li key={item.id} className="backup-result-row"><div><strong>{item.id}</strong><p>{formatTimestamp(item.createdAt, locale)} · {t("{0} 条事件", {0: item.clickhouse.rows})}</p></div>
          <ActionButton icon="refresh" className="btn btn-danger" loading={busy === item.id} disabled={!!busy || dirty} onClick={() => {
            if (!window.confirm(t("确认用 {0} 覆盖当前数据库？", {0: item.id}))) return
            void perform(item.id, async () => {await restoreBackupFn({data: {id: item.id}}); setMsg(t("已恢复 {0}，请刷新页面", {0: item.id}))})
          }}>{t(busy === item.id ? "恢复中" : "恢复此备份")}</ActionButton>
        </li>)}
      </ul> : <div className="backup-empty"><UIIcon name="cloud"/><p>{t(scanned ? "这个目录下还没有 LiteStats 备份" : "扫描后，这里会列出可恢复的备份。")}</p></div>}
      <p className="backup-restore-note"><UIIcon name="warn"/>{t("恢复会覆盖当前数据库。请确认备份后再操作。")}</p>
    </Tile>
  </div>
}
