import { UIIcon } from "~/components/UIIcon"
import { ActionButton } from "~/components/ActionButton"
import { formatTimestamp } from "~/lib/format"
import { useEffect, useState } from "react"
import { Field, FormActions, SettingsForm } from "~/components/SettingsForm"
import { Tile } from "~/components/ui"
import { runSiteMonitorFn, saveSiteMonitorFn, siteMonitorHistoryFn } from "~/lib/actions"
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
  const { t, locale } = useT()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [url, setUrl] = useState(initial.url)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [history, setHistory] = useState(initial.history)
  const [historyPending, setHistoryPending] = useState(false)
  const [historyError, setHistoryError] = useState("")
  useEffect(() => { setHistory(initial.history); setHistoryError("") }, [initial.history])
  async function loadHistory(days: 7 | 30, page: number) {
    setHistoryPending(true)
    setHistoryError("")
    try {
      setHistory(await siteMonitorHistoryFn({ data: { domain, days, page, asOf: history.asOf } }))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : t("无法加载检测记录"))
    } finally { setHistoryPending(false) }
  }
  const latest = initial.latest

  return (
    <>
      <Tile icon="activity" title={t("monitor.title")} subtitle={t("monitor.sub")}>
        <div className="monitor-status-row">
          <StatusPill up={latest.status === "up"} empty={!latest.status} label={latest.status === "up" ? t("monitor.up") : latest.status === "down" ? t("monitor.down") : t("monitor.pending")} />
          <SslPill health={latest.ssl_health} days={latest.ssl_days_left} />
          {latest.response_ms != null ? <span className="text-sm text-gray-500">{latest.response_ms}ms</span> : null}
          {latest.checked_at ? <span className="text-sm text-gray-500">{formatTimestamp(latest.checked_at, locale)}</span> : null}
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
              setError(err instanceof Error ? err.message : t("无法保存"))
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
          {error ? <p className="mt-3 text-sm text-red-500">{t(error || "")}</p> : null}
          <FormActions>
            <ActionButton className="btn btn-primary" type="submit">{t("monitor.save")}</ActionButton>
            <ActionButton
              icon="refresh"
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
                  setError(err instanceof Error ? err.message : t("检测失败"))
                } finally {
                  setPending(false)
                }
              }}
            >
              {pending ? t("monitor.checking") : t("monitor.check_now")}
            </ActionButton>
          </FormActions>
        </SettingsForm>
      </Tile>
      <Tile icon="clock" title={t("monitor.history")} subtitle={t("monitor.history_sub")}>
        <div className="monitor-history-toolbar">
          <div className="monitor-history-ranges" role="group" aria-label={t("monitor.range")}>
            {([7, 30] as const).map(days => <button key={days} type="button" aria-pressed={history.days === days} disabled={historyPending} onClick={() => loadHistory(days, 1)}>{t(days === 7 ? "monitor.days7" : "monitor.days30")}</button>)}
          </div>
          <span aria-live="polite">{historyPending ? t("monitor.loading") : `${t("monitor.total")} ${history.total} ${t("monitor.records")}`}</span>
        </div>
        {historyError ? <p className="text-sm text-red-500" role="alert">{historyError}</p> : null}
        {history.rows.length === 0 ? (
          <div className="settings-empty"><UIIcon name="clock" /><span>{t("monitor.empty")}</span></div>
        ) : (
          <div className="monitor-history-scroll is-paginated" aria-busy={historyPending} tabIndex={0} role="region" aria-label={t("monitor.history")}><table className="monitor-history-table">
            <caption className="sr-only">{t("monitor.history")}</caption>
            <thead>
              <tr className="text-gray-500">
                <th className="py-2 font-medium">{t("monitor.when")}</th>
                <th className="py-2 font-medium">{t("monitor.uptime")}</th>
                <th className="py-2 font-medium">SSL</th>
                <th className="py-2 font-medium">{t("monitor.latency")}</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-700">{formatTimestamp(row.checked_at, locale)}</td>
                  <td className="py-2"><StatusPill up={row.status === "up"} label={row.status === "up" ? t("monitor.up") : t("monitor.down")} /></td>
                  <td className="py-2"><span className={row.ssl_valid ? "monitor-history-ssl" : "text-gray-500"}>{row.ssl_valid ? `${row.ssl_days_left ?? "—"}d` : t("monitor.ssl_invalid")}</span></td>
                  <td className="py-2 monitor-history-latency">{row.response_ms != null ? <>{row.response_ms}<span className="monitor-history-unit">ms</span></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <nav className="monitor-history-pagination" aria-label={t("monitor.pagination")}>
          <span>{t("monitor.per_page")}</span>
          <div>
            <button type="button" disabled={historyPending || history.page <= 1} onClick={() => loadHistory(history.days, history.page - 1)}>{t("monitor.previous")}</button>
            <span aria-live="polite">{history.page} / {history.pages}</span>
            <button type="button" disabled={historyPending || history.page >= history.pages} onClick={() => loadHistory(history.days, history.page + 1)}>{t("monitor.next")}</button>
          </div>
        </nav>
      </Tile>
    </>
  )
}

export function StatusPill({ up, empty, label }: { up: boolean, empty?: boolean, label: string }) {
  const { t } = useT()
  return <span className={`monitor-pill${empty ? " is-empty" : up ? " is-up" : " is-down"}`}>{t(label || "")}</span>
}

export function SslPill({ health, days }: { health: string, days?: number | null }) {
  const { t } = useT()
  if (health === "none") return <span className="monitor-pill is-empty">{t("monitor.ssl_none")}</span>
  if (health === "invalid") return <span className="monitor-pill is-down">{t("monitor.ssl_invalid")}</span>
  if (health === "critical") return <span className="monitor-pill is-down">SSL {days}d</span>
  if (health === "warning") return <span className="monitor-pill is-warn">SSL {days}d</span>
  return <span className="monitor-pill is-up">SSL {days}d</span>
}
