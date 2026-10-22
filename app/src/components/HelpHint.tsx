import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useT } from "~/lib/i18n"
import { UIIcon } from "./UIIcon"

/** Optional context stays available to pointer, touch and keyboard users. */
export function HelpHint({children, label, id}: {children: ReactNode; label?: string; id?: string}) {
  const {t} = useT()
  const name = label || t("查看详情")
  const details = useRef<HTMLDetailsElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({left:16, top:16})
  const place = useCallback(() => {
    const trigger = details.current?.querySelector("summary")
    if (!trigger || !copy.current) return
    const rect = trigger.getBoundingClientRect()
    const panel = copy.current.getBoundingClientRect()
    const left = Math.max(16, Math.min(rect.right - panel.width, window.innerWidth - panel.width - 16))
    const below = rect.bottom + 8
    const top = below + panel.height <= window.innerHeight - 16 ? below : Math.max(16, rect.top - panel.height - 8)
    setPosition({left, top})
  }, [])
  useEffect(() => {
    if (!open) return
    place()
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) details.current.open = false
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current) {
        event.preventDefault()
        event.stopPropagation()
        details.current.open = false
        details.current.querySelector("summary")?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey, true)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey, true)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, place])
  return <details ref={details} className="help-hint" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary aria-label={name} title={name}><UIIcon name="unknown" className="size-3.5" /></summary>
    <div ref={copy} id={id} className="help-hint-copy" role="note" style={position}>{children}</div>
  </details>
}
