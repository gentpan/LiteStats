import type { ButtonHTMLAttributes } from "react"
import { UIIcon } from "./UIIcon"

export function ActionButton({icon,className="",type="button",children,loading=false,disabled,...props}:ButtonHTMLAttributes<HTMLButtonElement> & {icon?:string;loading?:boolean}) {
  const danger=/btn-danger|text-red/.test(className)
  const variant=/btn-primary/.test(className) ? "primary" : danger ? "danger" : /btn-ghost/.test(className) ? "ghost" : "secondary"
  const glyph=icon || (type === "submit" ? "save" : danger ? "trash" : undefined)
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-variant={variant} className={`squircle ui-action ${className}`}>
    {loading ? <svg className="button-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg> : glyph ? <UIIcon name={glyph}/> : null}{children}
  </button>
}
