import { Outlet, createFileRoute, useChildMatches, useRouter } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { InstallDialog } from "~/components/InstallDialog"
import { ServerNodeCard } from "~/components/ServerNodeCard"
import { Shell } from "~/components/Shell"
import { addServerFn, meFn, removeServerFn, serverInstallFn, serversFn } from "~/lib/actions"
import { formatBps, metricNum, serverOnline, type MonitorServer } from "~/lib/monitor-view"

export const Route = createFileRoute("/servers")({
  loader: async () => {
    const me = await meFn()
    if (!me) return { me: null, servers: [] as MonitorServer[] }
    return { me, servers: await serversFn() }
  },
  component: ServersPage,
})

function ServersPage() {
  const childMatches = useChildMatches()
  const { me, servers: initial } = Route.useLoaderData()
  const router = useRouter()
  const [servers, setServers] = useState<MonitorServer[]>(() => initial ?? [])
  const [name, setName] = useState("")
  const [query, setQuery] = useState("")
  const [created, setCreated] = useState<{ id: string, name: string, secret: string } | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setServers(initial ?? [])
  }, [initial])

  useEffect(() => {
    if (!me) return
    const timer = window.setInterval(() => {
      void serversFn().then((rows) => setServers(rows ?? [])).catch(() => {})
    }, 5000)
    return () => window.clearInterval(timer)
  }, [me])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return servers
    return servers.filter((server) => {
      const os = String(server.latest_metrics?.os || "")
      return server.name.toLowerCase().includes(q) || os.toLowerCase().includes(q)
    })
  }, [query, servers])

  if (childMatches.length > 0) return <Outlet />

  if (!me) {
    void router.navigate({ to: "/login" })
    return null
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const online = servers.filter((server) => serverOnline(server.last_seen_at)).length
  const inSpeed = servers.reduce((sum, server) => sum + metricNum(server.latest_metrics, "net_in_speed"), 0)
  const outSpeed = servers.reduce((sum, server) => sum + metricNum(server.latest_metrics, "net_out_speed"), 0)

  return (
    <Shell user={me} wide>
      <div className="server-board pt-6 pb-16">
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">服务器</h1>
            <p className="mt-1 text-sm text-gray-500">
              {servers.length} 台 · 在线 {online} · 离线 {servers.length - online} · ↓ {formatBps(inSpeed)} · ↑ {formatBps(outSpeed)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-40" placeholder="搜索" value={query} onChange={(e) => setQuery(e.target.value)} />
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                setPending(true)
                setError("")
                try {
                  const row = await addServerFn({ data: { name } })
                  setCreated(row)
                  setName("")
                  setServers((await serversFn()) ?? [])
                } catch (err) {
                  setError(err instanceof Error ? err.message : "无法添加服务器")
                } finally {
                  setPending(false)
                }
              }}
            >
              <input className="input w-44" placeholder="新服务器名称" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "添加中…" : "添加服务器"}</button>
            </form>
          </div>
        </div>
        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
        {created ? <InstallDialog server={created} origin={origin} onClose={() => setCreated(null)} /> : null}
        {visible.length === 0 ? (
          <p className="mt-16 text-center text-sm text-gray-500">还没有匹配的服务器。本机会自动采集，其它机器添加后安装 LiteStats 探针。</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((server) => (
              <ServerNodeCard
                key={server.id}
                server={server}
                onInstall={server.kind === "local" ? undefined : async () => {
                  try {
                    setCreated(await serverInstallFn({ data: { id: server.id } }))
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "无法读取安装命令")
                  }
                }}
                onRemove={async () => {
                  if (!window.confirm("删除这台服务器？")) return
                  await removeServerFn({ data: { id: server.id } })
                  setServers(await serversFn())
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
