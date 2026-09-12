import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Shell } from "~/components/Shell"
import { meFn, setupTeamFn, teamFn } from "~/lib/actions"

const ROLES = [
  { id: "owner", label: "Owner", help: "无限制管理团队" },
  { id: "admin", label: "Admin", help: "管理所有团队设置" },
  { id: "editor", label: "Editor", help: "创建和查看新站点" },
  { id: "billing", label: "Billing", help: "管理订阅" },
  { id: "viewer", label: "Viewer", help: "查看团队下所有站点" },
]

export const Route = createFileRoute("/team/setup")({
  loader: async () => {
    const me = await meFn()
    if (!me) return { me: null, team: null, members: [], invitations: [], suggestedName: "" }
    const team = await teamFn()
    return { me, ...team }
  },
  component: TeamSetupPage,
})

function TeamSetupPage() {
  const { me, team, members, invitations, suggestedName } = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState(team?.setup_complete ? team.name : (suggestedName || team?.name || ""))
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("viewer")
  const [pending, setPending] = useState<Array<{ email: string, role: string }>>([])
  const [error, setError] = useState("")

  if (!me) {
    void router.navigate({ to: "/login" })
    return null
  }
  if (team?.setup_complete) {
    void router.navigate({ to: "/account", search: { tab: "team/general" } })
    return null
  }

  return (
    <Shell user={me}>
      <div className="mx-auto mt-12 w-full max-w-lg rounded-md bg-white text-gray-900 shadow-md">
        <div className="flex justify-between px-8 pt-8">
          <div className="text-lg font-medium">创建团队</div>
        </div>
        <p className="mt-4 px-8 text-sm leading-6 text-gray-600">
          为团队命名，添加成员并分配角色。准备好后，点击「创建团队」发送邀请。
        </p>
        <div className="relative -mt-0 px-8 pt-4 pb-8">
          <label className="mt-4 mb-8 block text-sm font-medium text-gray-900">
            名称
            <input
              className="input mt-2"
              autoFocus
              placeholder={suggestedName}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="mb-2 text-sm font-medium text-gray-900">团队成员</div>
          <form
            className="mb-8 flex gap-x-3"
            onSubmit={(e) => {
              e.preventDefault()
              const next = email.trim()
              if (!next) return
              if (pending.some((p) => p.email === next) || members.some((m) => m.email === next)) return
              setPending((list) => [...list, { email: next, role }])
              setEmail("")
            }}
          >
            <input className="input flex-1" type="email" placeholder="输入邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button className="btn btn-primary" type="submit">邀请</button>
          </form>
          {members.map((m) => (
            <div key={m.email} className="mt-6 flex items-center gap-x-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {m.name}
                  <span className="ml-1 rounded-md bg-gray-150 px-1 py-0.5 text-xs text-gray-500">{m.email === me.email ? "你" : ""}</span>
                </span>
                <span className="text-xs text-gray-500">{m.email}</span>
              </div>
              <div className="flex-1 text-right text-sm capitalize text-gray-700">{m.role}</div>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.email} className="mt-6 flex items-center gap-x-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-white">{p.email.slice(0, 1).toUpperCase()}</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {p.email}
                  <span className="ml-1 rounded-md bg-gray-150 px-1 py-0.5 text-xs text-gray-500">待邀请</span>
                </span>
              </div>
              <div className="flex-1 text-right text-sm capitalize">{p.role}</div>
            </div>
          ))}
          {invitations.map((inv) => (
            <div key={inv.email} className="mt-6 flex items-center gap-x-5 text-sm">
              <span>{inv.email}</span>
              <span className="ml-auto text-gray-500">{inv.role}</span>
            </div>
          ))}
          {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
          <button
            type="button"
            className="btn btn-primary mt-8 w-full"
            disabled={!name.trim()}
            onClick={async () => {
              setError("")
              try {
                await setupTeamFn({ data: { name: name.trim(), invites: pending } })
                await router.navigate({ to: "/account", search: { tab: "team/general" } })
              } catch (err) {
                setError(err instanceof Error ? err.message : "无法创建团队")
              }
            }}
          >
            创建团队
          </button>
        </div>
      </div>
    </Shell>
  )
}
