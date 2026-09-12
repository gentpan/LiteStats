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
  const command = agentInstallCommand(server, origin)
  return (
    <div className="settings-modal" onClick={onClose} role="presentation">
      <div className="settings-modal-card max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="settings-modal-body">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-medium text-gray-900">{server.name} 的探针</h3>
            <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={onClose}>关闭</button>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            在要监控的那台机器上执行下面的命令，安装 LiteStats 自己的探针。
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-gray-900 p-3 text-xs leading-5 text-gray-100">{command}</pre>
        </div>
      </div>
    </div>
  )
}
