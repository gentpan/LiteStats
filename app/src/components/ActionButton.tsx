import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { UIIcon } from "./UIIcon"

function actionVariant(className: string) {
  if (/btn-primary/.test(className)) return "primary"
  if (/btn-danger|text-red/.test(className)) return "danger"
  return /btn-ghost/.test(className) ? "ghost" : "secondary"
}

export function ActionButton({icon,className="",type="button",children,loading=false,disabled,...props}:ButtonHTMLAttributes<HTMLButtonElement> & {icon?:string;loading?:boolean}) {
  const variant = actionVariant(className)
  const glyph=icon || (type === "submit" ? "save" : variant === "danger" ? "trash" : undefined)
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-variant={variant} className={`squircle ui-action ${className}`}>
    {loading ? <svg className="button-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg> : glyph ? <UIIcon name={glyph}/> : null}{children}
  </button>
}

type ActionLinkProps = Omit<ComponentProps<typeof Link>, "children" | "params" | "search"> & {
  icon?: string
  children?: ReactNode
  params?: Record<string, string>
  search?: Record<string, unknown>
}

export function ActionLink({icon,className="",children,...props}:ActionLinkProps) {
  const linkProps = props as ComponentProps<typeof Link>
  return <Link {...linkProps} data-variant={actionVariant(className)} className={`squircle ui-action ${className}`}>
    {icon ? <UIIcon name={icon}/> : null}{children}
  </Link>
}

export function ActionUpload({icon,className="",children,...props}:InputHTMLAttributes<HTMLInputElement> & {icon?:string}) {
  return <label data-variant={actionVariant(className)} className={`squircle ui-action ${className}`}>
    {icon ? <UIIcon name={icon}/> : null}{children}<input {...props} type="file" className="sr-only"/>
  </label>
}
