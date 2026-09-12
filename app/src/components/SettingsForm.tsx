import { type FormEvent, type ReactNode } from "react"

export function SettingsForm({
  children,
  onSubmit,
}: {
  children: ReactNode
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void | Promise<void>
}) {
  return (
    <form className="settings-form" onSubmit={onSubmit}>
      {children}
    </form>
  )
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
  return (
    <label className={`settings-field${wide ? " is-wide" : ""}`}>
      <span className="settings-label">{label}</span>
      {hint ? <span className="settings-hint">{hint}</span> : null}
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
  if (!open) return null
  return (
    <div className="settings-modal" onClick={onClose} role="presentation">
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            await onSubmit()
          }}
        >
          <div className="settings-modal-body">
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <div className="mt-3 space-y-3 text-sm text-gray-600">{children}</div>
          </div>
          <div className="settings-modal-foot">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" className={danger ? "btn btn-danger" : "btn btn-primary"} disabled={pending}>
              {pending ? "处理中…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
