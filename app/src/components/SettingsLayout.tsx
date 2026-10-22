import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import { UIIcon } from "./UIIcon"
import { useT } from "~/lib/i18n"

/** One workspace with persistent desktop navigation and a compact mobile menu. */
export function SettingsLayout({ sidebar, children, navigationTitle }: { sidebar: ReactNode; children: ReactNode; navigationTitle?:string }) {
  const {t}=useT()
  const [open,setOpen]=useState(false)
  const navigationId=useId()
  const toggle=useRef<HTMLButtonElement>(null)
  const href=useRouterState({select:state=>state.location.href})
  useEffect(()=>setOpen(false),[href])
  return <div className="squircle settings-layout">
    <aside className="settings-sidebar" onKeyDown={event=>{
      if(event.key !== "Escape" || !open)return
      event.preventDefault();setOpen(false);toggle.current?.focus()
    }}>
      <button ref={toggle} type="button" className="squircle settings-mobile-toggle" aria-expanded={open} aria-controls={navigationId} onClick={()=>setOpen(!open)}><UIIcon name="settings"/><span>{navigationTitle || t("设置导航")}</span><UIIcon name="chevron-down" className="ui-chevron"/></button>
      <div id={navigationId} className={`settings-sidebar-body${open ? " is-open" : ""}`} onClick={event=>{
        if(!open || !(event.target instanceof Element) || !event.target.closest("a"))return
        setOpen(false);toggle.current?.focus()
      }}>{sidebar}</div>
    </aside>
    <div className="settings-content">{children}</div>
  </div>
}
