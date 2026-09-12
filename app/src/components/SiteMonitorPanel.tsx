import { useState } from "react"
import { Field, FormActions, SettingsForm } from "~/components/SettingsForm"
import { Tile } from "~/components/ui"
import { runSiteMonitorFn, saveSiteMonitorFn } from "~/lib/actions"
import { useT } from "~/lib/i18n"

type Monitor = Awaited<ReturnType<typeof import("~/lib/actions").siteSettingsFn>>["monitor"]

export function SiteMonitorPanel({
  domain,
  initial,
  onSaved,
}: {
  domain: string
  initial: Monitor
  onSaved: () => void
}) {
  const { t } = useT()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [url, setUrl] = useState(initial.url)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const latest = initial.latest

  return (
    <>
      <Tile title={t("monitor.title")} subtitle={t("monitor.sub")}>
        <div className="monitor-status-row">
          <StatusPill up={latest.status === "up"} empty={!latest.status} label={latest.status === "up" ? t("monitor.up") : latest.status === "down" ? t("monitor.down") : t("monitor.pending")} />
          <SslPill health={latest.ssl_health} days={latest.ssl_days_left} />
          {latest.response_ms != null ? <span className="text-sm text-gray-500">{latest.response_ms}ms</span> : null}
          {latest.checked_at ? <span className="text-sm text-gray-500">{new Date(latest.checked_at).toLocaleString()}</span> : null}
        </div>
        {latest.error ? <p className="mt-2 text-sm text-red-500">{latest.error}</p> : null}
        {latest.ssl_issuer ? <p className="mt-1 text-sm text-gray-500">{t("monitor.issuer")}：{latest.ssl_issuer}</p> : null}
        <SettingsForm
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            try {
              await saveSiteMonitorFn({ data: { domain, enabled, url } })
              onSaved()
            } catch (err) {
              setError(err instanceof Error ? err.message : "无法保存")
            }
          }}
        >
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t("monitor.enabled")}
          </label>
          <Field label={t("monitor.url")}>
            <input className="input" value={url} placeholder={`https://${domain}`} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
          <FormActions>
            <button className="btn btn-primary" type="submit">{t("monitor.save")}</button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={async () => {
                setPending(true)
                setError("")
                try {
                  await runSiteMonitorFn({ data: { domain } })
                  onSaved()
                } catch (err) {
                  setError(err instanceof Error ? err.message : "检测失败")
                } finally {
                  setPending(false)
                }
              }}
            >
              {pending ? t("monitor.checking") : t("monitor.check_now")}
            </button>
          </FormActions>
        </SettingsForm>
      </Tile>
      <Tile title={t("monitor.history")} subtitle={t("monitor.history_sub")}>
        {initial.history.length === 0 ? (
          <p className="text-sm text-gray-500">{t("monitor.empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="py-2 font-medium">{t("monitor.when")}</th>
                <th className="py-2 font-medium">{t("monitor.uptime")}</th>
                <th className="py-2 font-medium">SSL</th>
                <th className="py-2 font-medium">{t("monitor.latency")}</th>
              </tr>
            </thead>
            <tbody>
              {initial.history.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-700">{new Date(row.checked_at).toLocaleString()}</td>
                  <td className="py-2">{row.status === "up" ? t("monitor.up") : t("monitor.down")}</td>
                  <td className="py-2">{row.ssl_valid ? `${row.ssl_days_left ?? "—"}d` : t("monitor.ssl_invalid")}</td>
                  <td className="py-2">{row.response_ms != null ? `${row.response_ms}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tile>
    </>
  )
}

export function StatusPill({ up, empty, label }: { up: boolean, empty?: boolean, label: string }) {
  return <span className={`monitor-pill${empty ? " is-empty" : up ? " is-up" : " is-down"}`}>{label}</span>
}

export function SslPill({ health, days }: { health: string, days?: number | null }) {
  const { t } = useT()
  if (health === "none") return <span className="monitor-pill is-empty">{t("monitor.ssl_none")}</span>
  if (health === "invalid") return <span className="monitor-pill is-down">{t("monitor.ssl_invalid")}</span>
  if (health === "critical") return <span className="monitor-pill is-down">SSL {days}d</span>
  if (health === "warning") return <span className="monitor-pill is-warn">SSL {days}d</span>
  return <span className="monitor-pill is-up">SSL {days}d</span>
}
