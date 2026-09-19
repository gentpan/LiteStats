import { Children, isValidElement, type CSSProperties, type ReactNode } from "react"

/** Link navigation with a purple glider inspired by Uiverse / Smit-Prajapati. */
export function SettingsNav({label,children}:{label:string;children:ReactNode}) {
  const items=Children.toArray(children)
  const active=items.findIndex(item=>isValidElement<{"aria-current"?:string}>(item) && item.props["aria-current"] === "page")
  return <nav aria-label={label} className="settings-nav settings-glider-nav" style={{"--active-index":Math.max(0,active)} as CSSProperties}>
    <span className="settings-glider-track" aria-hidden="true"><span className="settings-glider" data-active={active>=0}/></span>
    {children}
  </nav>
}
