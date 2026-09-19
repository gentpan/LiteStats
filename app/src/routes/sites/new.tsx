import { TrackingSnippet } from "~/components/TrackingSnippet"
import { ActionButton } from "~/components/ActionButton"
import { Surface } from "~/components/Surface"
import { UIIcon } from "~/components/UIIcon"
import { Navigate } from "@tanstack/react-router"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { createSiteFn, meFn, siteReadyFn } from "~/lib/actions"
import { useT } from "~/lib/i18n"
import { timezoneOptions } from "~/lib/timezones"

export const Route = createFileRoute("/sites/new")({
  loader: async () => ({ me: await meFn() }),
  component: NewSitePage,
})


function NewSitePage() {
  const { me } = Route.useLoaderData()
  const { t } = useT()
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai")
  const ZONES = useMemo(() => timezoneOptions(timezone), [timezone])
  const [created, setCreated] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const site = created || domain
  const snippet = `<script defer data-domain="${site}" src="${origin}/script.js"></script>`

  if (!me) {
    return <Navigate to="/login" />
  }

  return (
    <Shell user={me}>
      <SettingsHeader
        title={t("site.new_title")}
        back={(
          <Link to="/" className="btn btn-secondary btn-sm settings-back">
            <BackArrow />
            {t("settings.back_sites")}
          </Link>
        )}
      />
      <div className="mx-auto mt-6 w-full max-w-2xl pb-16">
        <div className="wizard-steps">
          <div className={`wizard-step${step === 1 ? " is-active" : step > 1 ? " is-done" : ""}`}>
            <span className="wizard-index">1</span>
            {t("site.step_site")}
          </div>
          <div className="wizard-line" />
          <div className={`wizard-step${step === 2 ? " is-active" : step > 2 ? " is-done" : ""}`}>
            <span className="wizard-index">2</span>
            {t("site.step_install")}
          </div>
          <div className="wizard-line" />
          <div className={`wizard-step${step === 3 ? " is-active" : ""}`}>
            <span className="wizard-index">3</span>
            {t("site.step_done")}
          </div>
        </div>
        <Surface className="bg-white p-5 shadow-sm sm:p-6">
        {step === 1 ? (
          <form
            className="space-y-6"
            onSubmit={async (e) => {
              e.preventDefault()
              setError("")
              setPending(true)
              try {
                const siteRow = await createSiteFn({ data: { domain, timezone, name } })
                setCreated(siteRow.domain)
                setStep(2)
              } catch (err) {
                setError(err instanceof Error ? err.message : t("无法创建站点"))
              } finally {
                setPending(false)
              }
            }}
          >
            <p className="text-sm text-gray-500">{t("site.new_sub")}</p>
            <label className="block text-sm font-medium text-gray-900">
              {t("站点名称")}
              <span className="mt-1 block text-xs font-normal text-gray-500">{t("在站点列表中显示，留空则默认使用域名。")}</span>
              <input className="input mt-2" placeholder="如：我的博客" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-gray-900">
              {t("site.domain")}
              <span className="mt-1 block text-xs font-normal text-gray-500">{t("site.domain_hint")}</span>
              <input className="input mt-2" autoFocus placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-gray-900">
              {t("site.timezone")}
              <select className="input mt-2" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {ZONES.map((zone) => <option key={zone.value} value={zone.value}>{t(zone.label)}</option>)}
              </select>
            </label>
            {error ? <p className="text-sm text-red-500">{t(error || "")}</p> : null}
            <div className="flex justify-end">
              <ActionButton className="btn btn-primary" icon="arrow" disabled={pending} type="submit">{pending ? t("添加中…") : t("site.next")}</ActionButton>
            </div>
          </form>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t("site.snippet")}</p>
            <TrackingSnippet code={snippet} />
            {error ? <p className="text-sm text-red-500">{t(error || "")}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton type="button" className="btn btn-secondary" onClick={() => setStep(3)}>{t("site.skip")}</ActionButton>
              <ActionButton
                type="button"
                className="btn btn-primary"
                icon="check"
                disabled={pending}
                onClick={async () => {
                  setPending(true)
                  setError("")
                  try {
                    const result = await siteReadyFn({ data: { domain: created } })
                    if (result.ready) {
                      setReady(true)
                      setStep(3)
                    } else {
                      setError(t("site.waiting"))
                    }
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("site.waiting"))
                  } finally {
                    setPending(false)
                  }
                }}
              >
                {pending ? t("检查中…") : t("site.check")}
              </ActionButton>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{ready ? t("site.detected") : t("site.snippet")}</p>
            <div className="flex justify-end">
              <Link to="/sites/$domain" params={{ domain: created }} className="btn btn-primary">{t("site.done_go")}<UIIcon name="arrow"/></Link>
            </div>
          </div>
        ) : null}
        </Surface>
      </div>
    </Shell>
  )
}
