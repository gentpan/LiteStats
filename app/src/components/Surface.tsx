import type { HTMLAttributes } from "react"

export type SurfaceRadius = "small" | "medium" | "large" | "xlarge" | "pill"

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article"
  radius?: SurfaceRadius
}

/** Shared corner geometry; layout and colors remain with the caller. */
export function Surface({ as: Tag = "div", radius = "large", className = "", ...props }: SurfaceProps) {
  return <Tag {...props} data-radius={radius} className={`ui-surface ${className}`} />
}
