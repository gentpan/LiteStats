import { ActionButton } from "./ActionButton"
import { UIIcon } from "./UIIcon"
import { useT } from "~/lib/i18n"
import { useEffect, useRef } from "react"
import { agentInstallCommand } from "~/lib/monitor-view"

export function InstallDialog({
  server,
  origin,
  onClose,
}: {
  server: { id: string, name: string, secret: string }
  origin: string
  onClose: () => void
}) {
  const { t } = useT()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = panel.current
    dialog?.querySelector<HTMLButtonElement>("button")?.focus()
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose() }
      if (event.key === "Tab") {
        const controls = dialog?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')
        if (!controls?.length) return
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", key)
    return () => { document.removeEventListener("keydown", key); previous?.focus() }
  }, [onClose])
  const command = agentInstallCommand(server, origin)
  return (
    <div className="settings-modal" onClick={onClose} role="presentation">
      <div ref={panel} aria-labelledby="agent-dialog-title" className="settings-modal-card max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="settings-modal-body">
          <div className="flex items-start justify-between gap-4">
            <h3 id="agent-dialog-title" className="flex min-w-0 items-center gap-2 break-all text-base font-semibold text-gray-900"><UIIcon name="code"/>{server.name}{t("的探针")}</h3>
            <ActionButton className="btn-ghost shrink-0" onClick={onClose}>{t("关闭")}</ActionButton>
          </div>
          <p className="mt-3 text-sm text-gray-600">{t("在要监控的那台机器上执行下面的命令，安装 LiteStats 自己的探针。")}</p>
          <p className="mt-2 text-xs text-gray-500">{t("安装命令默认启用三网延迟与丢包探测。已安装的旧探针需要重新执行此命令更新。")}</p>
          <pre tabIndex={0} className="mt-4 max-w-full overflow-x-auto rounded-md bg-gray-900 p-4 text-xs leading-6 text-gray-100">{command}</pre>
        </div>
      </div>
    </div>
  )
}
