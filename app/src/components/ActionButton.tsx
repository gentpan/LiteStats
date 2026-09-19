import type { ButtonHTMLAttributes } from "react"
import { UIIcon } from "./UIIcon"

export function ActionButton({icon,className="",type="button",children,...props}:ButtonHTMLAttributes<HTMLButtonElement> & {icon?:string}) {
  const danger=/btn-danger|text-red/.test(className)
  const variant=/btn-primary/.test(className) ? "primary" : danger ? "danger" : /btn-ghost/.test(className) ? "ghost" : "secondary"
  const glyph=icon || (type === "submit" ? "save" : danger ? "trash" : undefined)
  return <button {...props} type={type} data-variant={variant} className={`ui-action ${className}`}>{glyph ? <UIIcon name={glyph}/> : null}{children}</button>
}
