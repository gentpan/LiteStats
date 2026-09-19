import { useEffect, useState, type ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import { UIIcon } from "./UIIcon"
import { useT } from "~/lib/i18n"

/** One workspace with persistent desktop navigation and a compact mobile menu. */
export function SettingsLayout({ sidebar, children, navigationTitle }: { sidebar: ReactNode; children: ReactNode; navigationTitle?:string }) {
  const {t}=useT()
  const [open,setOpen]=useState(false)
  const href=useRouterState({select:state=>state.location.href})
  useEffect(()=>setOpen(false),[href])
  return <div className="settings-layout">
    <aside className="settings-sidebar">
      <button type="button" className="settings-mobile-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}><UIIcon name="settings"/><span>{navigationTitle || t("设置导航")}</span><UIIcon name="arrow" className={open ? "-rotate-90" : "rotate-90"}/></button>
      <div className={`settings-sidebar-body${open ? " is-open" : ""}`}>{sidebar}</div>
    </aside>
    <div className="settings-content">{children}</div>
  </div>
}
