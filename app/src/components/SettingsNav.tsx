import type { ReactNode } from "react"

/** Actual links carry aria-current; each selected row has one solid background. */
export function SettingsNav({label,children}:{label:string;children:ReactNode}) {
  return <nav aria-label={label} className="settings-nav">{children}</nav>
}
