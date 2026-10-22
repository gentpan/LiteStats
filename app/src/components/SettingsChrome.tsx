import { UIIcon } from "~/components/UIIcon"
import { ManagementHeader } from "./ManagementHeader"
import { useT } from "~/lib/i18n"
import type { ReactNode } from "react"

export function BackArrow() {
  return (
    <UIIcon name="arrow-left" className="size-4" />
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
