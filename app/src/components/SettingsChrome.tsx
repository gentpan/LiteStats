import { UIIcon } from "~/components/UIIcon"
import { useT } from "~/lib/i18n"
import type { ReactNode } from "react"

/** Header contract for management pages; analytics keeps its own toolbar. */
export function ManagementHeader({title,description,children}: {title:ReactNode;description?:string;children?:ReactNode}) {
  return <header className="squircle management-heading"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children ? <div className="management-heading-actions">{children}</div> : null}</header>
}

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
