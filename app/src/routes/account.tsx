import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { AccountPreferences } from "~/components/AccountPreferences"
import { AccountSecurity } from "~/components/AccountSecurity"
import { BackupPanel } from "~/components/BackupPanel"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { Notice, Tile } from "~/components/ui"
import { useT } from "~/lib/i18n"
import {
  accountSettingsFn,
  backupSettingsFn,
  createApiKeyFn,
  deleteAccountFn,
  deleteTeamFn,
  inviteFn,
  leaveTeamFn,
  removeApiKeyFn,
  removeMemberFn,
  updateMemberRoleFn,
  updateTeamNameFn,
} from "~/lib/actions"

const ACCOUNT_TABS = [
  { id: "preferences", label: "偏好设置", icon: "cog" },
  { id: "security", label: "安全", icon: "lock" },
  { id: "api-keys", label: "API 密钥", icon: "key" },
  { id: "backup", label: "备份", icon: "download" },
  { id: "danger-zone", label: "危险操作", icon: "warn" },
]

const TEAM_TABS = [
  { id: "team/general", label: "常规", icon: "sliders" },
  { id: "api-keys", label: "API 密钥", icon: "key" },
  { id: "team/delete", label: "危险操作", icon: "warn" },
]

const ROLES = [
  { id: "owner", label: "Owner", help: "无限制管理团队" },
  { id: "admin", label: "Admin", help: "管理所有团队设置" },
  { id: "editor", label: "Editor", help: "创建和查看新站点" },
  { id: "billing", label: "Billing", help: "管理订阅" },
  { id: "viewer", label: "Viewer", help: "查看团队下所有站点" },
]

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: String(s.tab || "preferences") }),
  loader: async () => {
    try {
      const data = await accountSettingsFn()
      const backup = await backupSettingsFn().catch(() => null)
      return { data, backup }
    } catch {
      return { data: null, backup: null }
    }
  },
  component: AccountPage,
})

function AccountPage() {
  const { data, backup } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const router = useRouter()
  const { t } = useT()
  if (!data) {
    void router.navigate({ to: "/login" })
    return null
  }
  const user = data.user
  const team = data.team
  const setup = !!team?.setup_complete
  const accountTabs = setup ? ACCOUNT_TABS.filter((t) => t.id !== "api-keys") : ACCOUNT_TABS
  const teamTabs = setup ? TEAM_TABS.filter((t) => t.id !== "team/delete" || team?.role === "owner") : []

  return (
    <Shell user={{ ...user, team }}>
      <div>
        <SettingsHeader
          title={t("settings.title")}
          icon="cog"
          back={(
            <Link to="/" className="btn btn-secondary btn-sm settings-back">
              <BackArrow />
              {t("settings.back_sites")}
            </Link>
          )}
        />
        <div className="lg:mt-1.5 lg:grid lg:grid-cols-12 lg:gap-x-5">
          <div className="lg:col-span-3">
            <div className="sticky top-0 hidden flex-col gap-8 py-4 lg:flex">
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">账户</h3>
                  <p className="truncate text-sm text-gray-500">{user.email}</p>
                </div>
                <nav className="-ml-2 flex flex-col gap-0.5">
                  {accountTabs.map((item) => (
                    <Link
                      key={item.id}
                      to="/account"
                      search={{ tab: item.id }}
                      className={`flex items-center rounded-md px-2 py-2 text-sm leading-5 ${tab === item.id ? "bg-gray-150 font-semibold text-gray-900" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                    >
                      <TabIcon name={item.icon} />
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
              {setup && team ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">团队</h3>
                    <p className="truncate text-sm text-gray-500">{team.name}</p>
                  </div>
                  <nav className="-ml-2 flex flex-col gap-0.5">
                    {teamTabs.map((item) => (
                      <Link
                        key={item.id}
                        to="/account"
                        search={{ tab: item.id }}
                        className={`flex items-center rounded-md px-2 py-2 text-sm leading-5 ${tab === item.id ? "bg-gray-150 font-semibold text-gray-900" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                      >
                        <TabIcon name={item.icon} />
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-6 lg:col-span-9 lg:mt-4">
            {tab === "preferences" ? <AccountPreferences user={user} onSaved={() => router.invalidate()} /> : null}
            {tab === "security" ? <AccountSecurity user={user} passkeys={data.passkeys || []} onSaved={() => router.invalidate()} /> : null}
            {tab === "api-keys" ? <ApiKeys keys={data.keys} onSaved={() => router.invalidate()} /> : null}
            {tab === "backup" && backup ? <BackupPanel initial={backup} /> : null}
            {tab === "danger-zone" ? <DangerZone solelyOwned={data.solelyOwned} /> : null}
            {tab === "team/general" && team ? (
              <TeamGeneral
                team={team}
                members={data.members}
                invitations={data.invitations}
                meEmail={user.email}
                onSaved={() => router.invalidate()}
              />
            ) : null}
            {tab === "team/delete" && team ? <TeamDanger name={team.name} /> : null}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function ApiKeys({ keys, onSaved }: { keys: Array<{ id: number, name: string, key_prefix: string, scopes: string[] }>, onSaved: () => void }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState("stats_api")
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState("")
  if (creating) {
    return (
      <div className="mx-auto mt-12 w-full max-w-lg rounded-md bg-white p-8 text-gray-900 shadow-md">
        <h2 className="text-lg font-medium">新建 API 密钥</h2>
        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            try {
              const row = await createApiKeyFn({ data: { name, type } })
              setCreated(row.key)
              setCreating(false)
              onSaved()
            } catch (err) {
              setError(err instanceof Error ? err.message : "无法创建")
            }
          }}
        >
          <label className="block text-sm font-medium">
            名称
            <input className="input mt-2" placeholder="Development" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div>
            <div className="text-sm font-medium">类型</div>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="radio" className="mt-1" checked={type === "stats_api"} onChange={() => setType("stats_api")} />
              <span>
                <span className="font-medium">统计 API</span>
                <span className="block text-gray-500">完整访问统计 API</span>
              </span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="radio" className="mt-1" checked={type === "sites_api"} onChange={() => setType("sites_api")} />
              <span>
                <span className="font-medium">站点 API</span>
                <span className="block text-gray-500">完整访问统计 API 和站点 API</span>
              </span>
            </label>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button className="btn btn-primary w-full" type="submit">创建 API 密钥</button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => setCreating(false)}>取消</button>
        </form>
      </div>
    )
  }
  return (
    <Tile title="API 密钥" subtitle={keys.length ? "创建和管理访问权限。" : undefined}>
      {created ? (
        <div className="mb-4 rounded-md bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-900">请立即保存密钥，之后无法再查看。</p>
          <input className="input mt-2 font-mono" readOnly value={created} />
        </div>
      ) : null}
      {keys.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center justify-center pt-5 pb-6">
          <h3 className="text-center text-base font-medium text-gray-900">创建第一个 API 密钥</h3>
          <p className="mt-1 text-center text-sm leading-5 text-pretty text-gray-500">通过 LiteStats API 访问你的统计数据。</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setCreating(true)}>新建 API 密钥</button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>新建 API 密钥</button>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="py-2 font-medium">姓名</th>
                <th className="py-2 font-medium">密钥</th>
                <th className="py-2 font-medium">类型</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-gray-200">
                  <td className="py-3">{key.name}</td>
                  <td className="py-3 font-mono">{key.key_prefix}{"*".repeat(26)}</td>
                  <td className="py-3">{key.scopes.includes("sites:provision:*") ? "站点 API" : "统计 API"}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-700"
                      onClick={async () => {
                        if (!confirm("确定要撤销这把密钥吗？此操作无法撤销。")) return
                        await removeApiKeyFn({ data: { id: key.id } })
                        onSaved()
                      }}
                    >
                      撤销
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Tile>
  )
}

function DangerZone({ solelyOwned }: { solelyOwned: Array<{ name: string }> }) {
  const router = useRouter()
  return (
    <>
      <Notice title="危险操作">下方的破坏性操作可能导致数据无法恢复。请谨慎操作。</Notice>
      <Tile title="删除账号" subtitle="永久删除你的站点及所有已收集的统计数据。">
        {solelyOwned.length > 1 || (solelyOwned.length === 1 && solelyOwned[0].name) ? (
          <p className="text-sm text-gray-600">删除账号会同时删除你作为唯一所有者的团队及其站点。</p>
        ) : null}
        <button
          type="button"
          className="btn btn-danger mt-4"
          onClick={async () => {
            if (!confirm("删除账号也会删除你拥有的所有站点和数据。此操作无法撤销。确定吗？")) return
            await deleteAccountFn()
            await router.navigate({ to: "/login" })
          }}
        >
          删除我的账号
        </button>
      </Tile>
    </>
  )
}

function TeamGeneral({
  team,
  members,
  invitations,
  meEmail,
  onSaved,
}: {
  team: { name: string, role: string }
  members: Array<{ email: string, name: string, role: string, team: string }>
  invitations: Array<{ email: string, role: string, team: string }>
  meEmail: string
  onSaved: () => void
}) {
  const [name, setName] = useState(team.name)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("viewer")
  const [error, setError] = useState("")
  const canManage = team.role === "owner" || team.role === "admin"
  return (
    <>
      <Tile title="团队名称" subtitle="更改团队名称。">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            await updateTeamNameFn({ data: { name } })
            onSaved()
          }}
        >
          <label className="block w-1/2 text-sm font-medium text-gray-900">
            名称
            <input className="input mt-2" value={name} onChange={(e) => setName(e.target.value)} readOnly={!canManage} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!canManage}>更改名称</button>
        </form>
      </Tile>
      <Tile title="团队成员" subtitle="添加或移除成员，并调整他们的角色。">
        {canManage ? (
          <form
            className="mb-8 flex gap-x-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setError("")
              try {
                await inviteFn({ data: { email, role } })
                setEmail("")
                onSaved()
              } catch (err) {
                setError(err instanceof Error ? err.message : "邀请失败")
              }
            }}
          >
            <input className="input flex-1" type="email" placeholder="输入邮箱" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button className="btn btn-primary" type="submit">邀请</button>
          </form>
        ) : null}
        {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}
        {members.map((m) => (
          <div key={m.email} className="mt-6 flex items-center gap-x-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {m.name}
                {m.email === meEmail ? <span className="ml-1 rounded-md bg-gray-150 px-1 py-0.5 text-xs text-gray-500">你</span> : null}
              </span>
              <span className="text-xs text-gray-500">{m.email}</span>
            </div>
            <div className="flex-1 text-right">
              <select
                className="bg-transparent text-sm"
                value={m.role}
                disabled={!canManage}
                onChange={async (e) => {
                  await updateMemberRoleFn({ data: { email: m.email, role: e.target.value } })
                  onSaved()
                }}
              >
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          </div>
        ))}
        {invitations.map((inv) => (
          <div key={inv.email} className="mt-6 flex items-center gap-x-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-white">{inv.email.slice(0, 1).toUpperCase()}</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {inv.email}
                <span className="ml-1 rounded-md bg-gray-150 px-1 py-0.5 text-xs text-gray-500">已邀请</span>
              </span>
            </div>
            <div className="flex-1 text-right">
              <button type="button" className="text-sm text-red-600" onClick={async () => { await removeMemberFn({ data: { email: inv.email } }); onSaved() }}>移除</button>
            </div>
          </div>
        ))}
      </Tile>
      <Tile title="离开团队" subtitle="将自己从该团队中移除。">
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            if (!confirm("确定要离开这个团队吗？")) return
            await leaveTeamFn()
            window.location.assign("/")
          }}
        >
          离开团队
        </button>
      </Tile>
    </>
  )
}

function TeamDanger({ name }: { name: string }) {
  return (
    <>
      <Notice title="危险操作">下方的破坏性操作可能导致数据无法恢复。请谨慎操作。</Notice>
      <Tile title="删除团队" subtitle="删除所有关联站点及已收集的统计数据。">
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            if (!confirm("删除团队也会删除所有关联站点和数据。此操作无法撤销。确定吗？")) return
            await deleteTeamFn()
            window.location.assign("/")
          }}
        >
          删除「{name}」
        </button>
      </Tile>
    </>
  )
}

function TabIcon({ name }: { name: string }) {
  const cls = "mr-2 size-5"
  if (name === "lock") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
  if (name === "key") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>
  if (name === "warn") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
  if (name === "sliders") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>
  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
}
