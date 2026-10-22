import { ActionButton } from "./ActionButton"
import { useT } from "~/lib/i18n"
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react"

export function SettingsForm({
  children,
  onSubmit,
  className = "",
}: {
  className?: string
  children: ReactNode
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void | Promise<void>
}) {
  const { t } = useT()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  return <form className={`settings-form min-w-0 ${className}`} aria-busy={pending} onSubmit={async event => {
    event.preventDefault()
    if (pending) return
    setPending(true); setError("")
    try { await onSubmit?.(event) }
    catch (err) { setError(err instanceof Error ? err.message : t("保存失败")) }
    finally { setPending(false) }
  }}>
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{t(error)}</p> : null}
  </form>
}

export function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string
  hint?: string
  wide?: boolean
  children: ReactNode
}) {
  const { t } = useT()
  return (
    <label className={`settings-field min-w-0${wide ? " is-wide" : ""}`}>
      <span className="settings-label">{t(label || "")}</span>
      {hint ? <span className="settings-hint">{t(hint || "")}</span> : null}
      {children}
    </label>
  )
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="settings-actions">{children}</div>
}

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  danger,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  pending?: boolean
  onClose: () => void
  onSubmit: () => void | Promise<void>
}) {
  const { t } = useT()
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const submitting = useRef(pending)
  close.current = onClose
  submitting.current = pending
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === "Escape") {
        event.preventDefault()
        if (!submitting.current) close.current()
        return
      }
      if (event.key !== "Tab" || !dialog.current) return
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.matches(":disabled") && element.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (!first || !last) {event.preventDefault();dialog.current.focus();return}
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault();first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="settings-modal" onClick={() => {if (!pending) onClose()}} role="presentation">
      <div ref={dialog} tabIndex={-1} className="squircle settings-modal-card min-w-0" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <SettingsForm
          onSubmit={async (e) => {
            e.preventDefault()
            await onSubmit()
          }}
        >
          <div className="settings-modal-body">
            <h3 id={titleId} className="break-words text-lg font-medium text-gray-900">{t(title || "")}</h3>
            <div className="mt-3 space-y-3 text-sm text-gray-600">{children}</div>
          </div>
          <div className="squircle settings-modal-foot">
            <ActionButton type="button" className="btn" onClick={onClose}>{t("取消")}</ActionButton>
            <ActionButton type="submit" className={danger ? "btn btn-danger" : "btn btn-primary"} disabled={pending}>
              {pending ? t("处理中…") : confirmLabel}
            </ActionButton>
          </div>
        </SettingsForm>
      </div>
    </div>
  )
}
