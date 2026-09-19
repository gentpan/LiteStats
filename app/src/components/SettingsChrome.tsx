import { ManagementHeader } from "./ManagementHeader"
import { useT } from "~/lib/i18n"
import type { ReactNode } from "react"

export function BackArrow() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  )
}

export function SettingsHeader({
  title,
  domain,
  name,
  back,
}: {
  title: string
  domain?: string
  name?: string
  back: ReactNode
}) {
  const { t } = useT()
  const display = domain ? (name && name.toLowerCase() !== domain.toLowerCase() ? `${name} (${domain})` : domain) : ""
  return (
    <ManagementHeader title={domain ? <span className="site-settings-title"><span>{t(title)}</span><span className="site-settings-domain">{display}</span></span> : t(title || "")}>{back}</ManagementHeader>
  )
}
