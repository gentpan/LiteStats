import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { SiteMonitorPanel } from "~/components/SiteMonitorPanel"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { SettingsDivider, SettingsRow, SettingsRows, Tile } from "~/components/ui"
import { useT } from "~/lib/i18n"
import { timezoneOptions } from "~/lib/timezones"
import {
  createShareFn,
  inviteFn,
  meFn,
  removeFunnelFn,
  removeGoalFn,
  removeShareFn,
  removeSiteFn,
  saveFunnelFn,
  saveGoalFn,
  removeBingFn,
  removeGoogleFn,
  saveBingFn,
  saveGooglePropertyFn,
  saveSettingsFn,
  siteSettingsFn,
} from "~/lib/actions"

const TABS = [
  { id: "general", label: "常规", icon: "rocket" },
  { id: "monitor", label: "监控", icon: "activity" },
  { id: "people", label: "成员", icon: "users" },
  { id: "visibility", label: "可见性", icon: "eye" },
  { id: "goals", label: "目标", icon: "check" },
  { id: "funnels", label: "漏斗", icon: "funnel" },
  { id: "properties", label: "自定义属性", icon: "tag" },
  { id: "integrations", label: "集成", icon: "puzzle" },
  { id: "imports-exports", label: "导入与导出", icon: "download" },
  { id: "shields", label: "屏蔽", icon: "shield", children: [
    { id: "shields/ip", label: "IP 地址" },
    { id: "shields/countries", label: "国家/地区" },
    { id: "shields/pages", label: "页面" },
    { id: "shields/hostnames", label: "主机名" },
  ] },
  { id: "email-reports", label: "邮件报告", icon: "mail" },
  { id: "danger-zone", label: "危险操作", icon: "warn" },
]

const ZONES = timezoneOptions()

export const Route = createFileRoute("/sites/$domain/settings")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: String(s.tab || "general") }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params }) => {
    const me = await meFn()
    const data = await siteSettingsFn({ data: { domain: params.domain } })
    return { me, data }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { me, data } = Route.useLoaderData()
  const { domain } = Route.useParams()
  const { tab } = Route.useSearch()
  const router = useRouter()
  const { t } = useT()
  const [timezone, setTimezone] = useState(data.site.timezone || "Asia/Shanghai")
  const [newDomain, setNewDomain] = useState(domain)
  const [propsText, setPropsText] = useState((data.site.allowed_event_props || []).join(", "))
  const [isPublic, setIsPublic] = useState(!!data.site.public)
  const [shareName, setShareName] = useState("公开报表")
  const [goalForm, setGoalForm] = useState({ display_name: "", event_name: "", page_path: "" })
  const [funnelName, setFunnelName] = useState("")
  const [funnelGoals, setFunnelGoals] = useState<number[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [error, setError] = useState("")
  const [ok, setOk] = useState("")
  const [editingDomain, setEditingDomain] = useState(false)

  if (!me) {
    void router.navigate({ to: "/login" })
    return null
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const snippet = `<script defer data-domain="${domain}" src="${origin}/js/script.js"></script>`

  return (
    <Shell user={me}>
      <div>
        <SettingsHeader
          title={`${t("settings.site_for")} ${domain}`}
          icon="globe"
          back={(
            <Link to="/sites/$domain" params={{ domain }} className="btn btn-secondary btn-sm settings-back">
              <BackArrow />
              {t("settings.back_stats")}
            </Link>
          )}
        />
        <div className="lg:mt-1.5 lg:grid lg:grid-cols-12 lg:gap-x-5">
          <div className="lg:col-span-3">
            <div className="-ml-2 hidden flex-col gap-0.5 py-4 lg:sticky lg:top-0 lg:flex">
              {TABS.map((item) => (
                <div key={item.id}>
                  <Link
                    to="/sites/$domain/settings"
                    params={{ domain }}
                    search={{ tab: item.children ? item.children[0].id : item.id }}
                    className={`flex items-center rounded-md px-2 py-2 text-sm leading-5 outline-none transition duration-150 ${tab === item.id || tab.startsWith(`${item.id}/`) || (item.children && item.children.some((c) => c.id === tab)) ? "bg-gray-150 font-semibold text-gray-900" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                  >
                    <TabIcon name={item.icon} />
                    {item.label}
                    {item.children ? <span className="ml-2 text-gray-400">▾</span> : null}
                  </Link>
                  {item.children ? (
                    <div className="ml-7 flex flex-col gap-0.5">
                      {item.children.map((child) => (
                        <Link
                          key={child.id}
                          to="/sites/$domain/settings"
                          params={{ domain }}
                          search={{ tab: child.id }}
                          className={`rounded-md px-2 py-2 text-sm leading-5 ${tab === child.id ? "bg-gray-150 font-semibold text-gray-900" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-6 lg:col-span-9 lg:mt-4">
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {ok ? <p className="text-sm text-indigo-600">{ok}</p> : null}

            {tab === "monitor" ? <SiteMonitorPanel domain={domain} initial={data.monitor} onSaved={() => router.invalidate()} /> : null}

            {tab === "general" ? (
              <div>
                <Tile title="站点详情" subtitle="管理这个站点的基本配置。">
                  <SettingsRows>
                    <SettingsRow label="站点域名">
                      {editingDomain ? (
                        <>
                          <input className="input max-w-72" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            onClick={async () => {
                              const saved = await saveSettingsFn({ data: { domain, timezone, allowed_event_props: data.site.allowed_event_props || [], public: isPublic, newDomain } })
                              setEditingDomain(false)
                              if (saved.domain !== domain) await router.navigate({ to: "/sites/$domain/settings", params: { domain: saved.domain }, search: { tab: "general" } })
                              else await router.invalidate()
                              setOk("域名已保存")
                            }}
                          >
                            保存
                          </button>
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setNewDomain(domain); setEditingDomain(false) }}>取消</button>
                        </>
                      ) : (
                        <>
                          <span className="rounded-md bg-gray-100 px-3 py-1.5 text-gray-800">{domain}</span>
                          <button className="text-sm font-medium text-indigo-600 hover:text-indigo-500" type="button" onClick={() => setEditingDomain(true)}>更改</button>
                        </>
                      )}
                    </SettingsRow>
                    <SettingsDivider />
                    <SettingsRow label="报表时区">
                      <select className="input max-w-72" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                        {ZONES.some((z) => z.value === timezone) ? null : <option value={timezone}>{timezone}</option>}
                        {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                      </select>
                      <button
                        className="btn btn-secondary btn-sm shrink-0"
                        type="button"
                        disabled={timezone === (data.site.timezone || "Asia/Shanghai")}
                        onClick={async () => {
                          await saveSettingsFn({ data: { domain, timezone, allowed_event_props: data.site.allowed_event_props || [], public: isPublic } })
                          await router.invalidate()
                          setOk("时区已保存")
                        }}
                      >
                        保存
                      </button>
                    </SettingsRow>
                  </SettingsRows>
                </Tile>
                <Tile title="采集" subtitle="管理这个站点如何收集访问数据。">
                  <SettingsRows>
                    <SettingsRow label="站点安装">
                      <Link to="/sites/$domain/settings" params={{ domain }} search={{ tab: "integrations" }} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">查看安装</Link>
                    </SettingsRow>
                  </SettingsRows>
                </Tile>
              </div>
            ) : null}

            {tab === "people" ? (
              <Tile title="成员" subtitle="邀请同事一起看这个站点的统计。">
                <form
                  className="mb-6 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await inviteFn({ data: { email: inviteEmail, role: "viewer" } })
                    setInviteEmail("")
                    await router.invalidate()
                  }}
                >
                  <input className="input" placeholder="email@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                  <button className="btn btn-primary" type="submit">邀请成员</button>
                </form>
                <ul className="divide-y divide-gray-200">
                  {data.members.map((m) => (
                    <li key={m.email} className="flex items-center gap-4 py-4">
                      <span className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{m.name}</p>
                        <p className="truncate text-sm text-gray-500">{m.email}</p>
                      </div>
                      <span className="text-sm text-gray-500">{m.role}</span>
                    </li>
                  ))}
                </ul>
              </Tile>
            ) : null}

            {tab === "visibility" ? (
              <div>
                <Tile title="公开仪表盘" subtitle="把统计公开，或者继续保持私密。">
                  <label className="flex items-center gap-3 text-sm text-gray-800">
                    <input type="checkbox" checked={isPublic} onChange={async (e) => {
                      setIsPublic(e.target.checked)
                      await saveSettingsFn({ data: { domain, timezone, allowed_event_props: data.site.allowed_event_props || [], public: e.target.checked } })
                      await router.invalidate()
                    }} />
                    公开这个站点的仪表盘
                  </label>
                </Tile>
                <Tile title="共享链接" subtitle="生成不需登录就能打开的报表链接。">
                  <form
                    className="mb-4 flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      await createShareFn({ data: { domain, name: shareName } })
                      setShareName("公开报表")
                      await router.invalidate()
                    }}
                  >
                    <input className="input" value={shareName} onChange={(e) => setShareName(e.target.value)} />
                    <button className="btn btn-primary" type="submit">创建</button>
                  </form>
                  <ul className="space-y-2 text-sm">
                    {data.shares.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <a className="text-indigo-600 hover:text-indigo-500" href={`/share/${s.slug}`}>{s.name} · /share/{s.slug}</a>
                        <button className="text-red-600" type="button" onClick={async () => { await removeShareFn({ data: { domain, id: s.id } }); await router.invalidate() }}>删除</button>
                      </li>
                    ))}
                  </ul>
                </Tile>
              </div>
            ) : null}

            {tab === "goals" ? (
              <Tile title="目标" subtitle="定义你希望用户完成的动作，比如访问某个页面或提交表单。">
                <form
                  className="mb-6 grid gap-3 md:grid-cols-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await saveGoalFn({ data: { domain, ...goalForm } })
                    setGoalForm({ display_name: "", event_name: "", page_path: "" })
                    await router.invalidate()
                  }}
                >
                  <input className="input" placeholder="显示名" value={goalForm.display_name} onChange={(e) => setGoalForm({ ...goalForm, display_name: e.target.value })} />
                  <input className="input" placeholder="事件名 Signup" value={goalForm.event_name} onChange={(e) => setGoalForm({ ...goalForm, event_name: e.target.value })} />
                  <input className="input" placeholder="或页面 /pricing" value={goalForm.page_path} onChange={(e) => setGoalForm({ ...goalForm, page_path: e.target.value })} />
                  <button className="btn btn-primary" type="submit">添加目标</button>
                </form>
                <ul className="divide-y divide-gray-200 text-sm">
                  {data.goals.map((g) => (
                    <li key={g.id} className="flex justify-between py-3">
                      <span>{g.display_name}</span>
                      <button className="text-red-600" type="button" onClick={async () => { await removeGoalFn({ data: { domain, id: g.id } }); await router.invalidate() }}>删除</button>
                    </li>
                  ))}
                </ul>
              </Tile>
            ) : null}

            {tab === "funnels" ? (
              <Tile title="漏斗" subtitle="把多个目标串成转化路径。">
                <form
                  className="mb-6 space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await saveFunnelFn({ data: { domain, name: funnelName, goalIds: funnelGoals } })
                    setFunnelName("")
                    setFunnelGoals([])
                    await router.invalidate()
                  }}
                >
                  <input className="input" placeholder="漏斗名称" value={funnelName} onChange={(e) => setFunnelName(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {data.goals.map((g) => (
                      <button key={g.id} type="button" className={`flex h-8 items-center rounded-md px-2.5 text-sm ${funnelGoals.includes(g.id) ? "bg-gray-150 text-gray-900" : "text-gray-700 hover:bg-gray-150/80"}`} onClick={() => setFunnelGoals((cur) => cur.includes(g.id) ? cur.filter((id) => id !== g.id) : [...cur, g.id])}>
                        {g.display_name}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-primary" type="submit">创建漏斗</button>
                </form>
                <ul className="divide-y divide-gray-200 text-sm">
                  {data.funnels.map((f) => (
                    <li key={f.id} className="flex justify-between py-3">
                      <span>{f.name}</span>
                      <button className="text-red-600" type="button" onClick={async () => { await removeFunnelFn({ data: { domain, id: f.id } }); await router.invalidate() }}>删除</button>
                    </li>
                  ))}
                </ul>
              </Tile>
            ) : null}

            {tab === "properties" ? (
              <Tile title="自定义属性" subtitle="只允许这些属性进入统计，用逗号分隔。">
                <input className="input mb-4" placeholder="logged_in, plan" value={propsText} onChange={(e) => setPropsText(e.target.value)} />
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    await saveSettingsFn({ data: { domain, timezone, allowed_event_props: propsText.split(",").map((s) => s.trim()).filter(Boolean), public: isPublic } })
                    await router.invalidate()
                    setOk("属性白名单已保存")
                  }}
                >
                  保存属性
                </button>
              </Tile>
            ) : null}

            {tab === "integrations" ? (
              <div>
                <Tile title="埋点脚本" subtitle="把这段代码放到网站的 <head> 里。默认会记录页面浏览、外链点击、文件下载，以及标题、语言和屏幕分辨率。">
                  <pre className="overflow-x-auto rounded-md bg-gray-900 p-4 text-sm text-gray-100">{snippet}</pre>
                </Tile>
                <Integrations data={data} domain={domain} onSaved={() => router.invalidate()} />
              </div>
            ) : null}

            {tab === "imports-exports" ? (
              <Tile title="导入与导出" subtitle="事件存在 ClickHouse，站点设置存在 PostgreSQL。">
                <p className="text-sm text-gray-500">目前没有 Google Analytics 导入。历史事件会留在 ClickHouse 里。</p>
              </Tile>
            ) : null}

            {tab.startsWith("shields") ? (
              <Tile title="屏蔽" subtitle="屏蔽指定 IP、国家/地区、页面或主机名的流量。">
                <p className="text-sm text-gray-500">还没有屏蔽规则。采集层会在后续版本接上这些名单。</p>
              </Tile>
            ) : null}

            {tab === "email-reports" ? (
              <Tile title="邮件报告" subtitle="按周或按月把统计发到邮箱。">
                <p className="text-sm text-gray-500">邮件报告还没接发送通道。站点设置和共享链接可以先用。</p>
              </Tile>
            ) : null}

            {tab === "danger-zone" ? (
              <div>
                <div className="mb-6 rounded-md bg-red-50 p-4">
                  <h3 className="text-sm font-medium text-gray-900">危险操作</h3>
                  <p className="mt-1 text-sm text-gray-600">下面的操作会造成无法恢复的数据丢失，请谨慎。</p>
                </div>
                <Tile title="删除站点" subtitle="永久删除站点设置。历史事件仍留在 ClickHouse。">
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`确认删除 ${domain}？`)) return
                      await removeSiteFn({ data: { domain } })
                      await router.navigate({ to: "/" })
                    }}
                  >
                    删除 {domain}
                  </button>
                </Tile>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function TabIcon({ name }: { name: string }) {
  const cls = "mr-2 size-5"
  if (name === "activity") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c8.25-4.5 11.25 4.5 19.5 0M2.25 12c8.25-4.5 11.25 4.5 19.5 0m-19.5 5.25c8.25-4.5 11.25 4.5 19.5 0" /></svg>
  if (name === "users") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
  if (name === "eye") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
  if (name === "check") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
  if (name === "funnel") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>
  if (name === "tag") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
  if (name === "puzzle") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.61.504-1.087 1.135-1.087h1.23c.631 0 1.135.477 1.135 1.087v1.226c0 .192.168.1.168.192 0 .10.10.0.4.10.0.1.2.192.192.168h1.226c.61 0 1.087.504 1.087 1.135v1.23c0 .631-.477 1.135-1.087 1.135h-1.226a.175.175 0 0 0-.168.192c0 .10.10.0.4.168a.175.175 0 0 0 .168.192h1.226c.61 0 1.087.504 1.087 1.135v1.23c0 .631-.477 1.135-1.087 1.135h-1.226a.175.175 0 0 0-.192.168c-.047.447-.449.832-.9.832s-.853-.385-.9-.832a.175.175 0 0 0-.192-.168H9.385c-.631 0-1.135-.477-1.135-1.087v-1.226a.175.175 0 0 0-.192-.168c-.447.047-.832-.449-.832-.9s.385-.853.832-.9a.175.175 0 0 0 .192-.168V9.385c0-.631.504-1.135 1.135-1.135h1.226c.192 0 .168-.168.168-.192 0-.451.385-.853.832-.9s.853.385.9.832c.10.20.0.2.192.168h1.226c.631 0 1.135-.504 1.135-1.135V6.087Z" /></svg>
  if (name === "download") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
  if (name === "shield") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Z" /></svg>
  if (name === "mail") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
  if (name === "warn") return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.63 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg>
}

function Integrations({
  data,
  domain,
  onSaved,
}: {
  data: Awaited<ReturnType<typeof siteSettingsFn>>
  domain: string
  onSaved: () => void
}) {
  const [apiKey, setApiKey] = useState("")
  const [siteUrl, setSiteUrl] = useState(data.bing?.site_url || `https://${domain}`)
  const [property, setProperty] = useState(data.google?.property || "")
  const [err, setErr] = useState("")
  return (
    <div>
      <Tile title="Google 搜索词" subtitle="连接 Search Console 后，来源卡片里的「搜索词」会显示谷歌关键词。需要环境变量 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI。">
        {data.google ? (
          <div className="space-y-3 text-sm">
            <p>已连接 {data.google.email}</p>
            {data.google.properties.length ? (
              <select className="input max-w-md" value={property} onChange={(e) => setProperty(e.target.value)}>
                <option value="">选择资源</option>
                {data.google.properties.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input className="input max-w-md" value={property} placeholder="sc-domain:example.com" onChange={(e) => setProperty(e.target.value)} />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => saveGooglePropertyFn({ data: { domain, property } }).then(onSaved).catch((e) => setErr(e instanceof Error ? e.message : "保存失败"))}>保存资源</button>
              <button type="button" className="btn btn-danger" onClick={() => removeGoogleFn({ data: { domain } }).then(onSaved)}>断开</button>
            </div>
          </div>
        ) : data.googleOAuth ? (
          <a className="btn inline-flex" href={data.googleAuthUrl}>连接 Google Search Console</a>
        ) : (
          <p className="text-sm text-gray-500">还没配置 Google OAuth。配好三个环境变量后刷新此页即可连接。</p>
        )}
      </Tile>
      <Tile title="Bing 搜索词" subtitle="在 Bing Webmaster 生成 API Key，填站点 URL 后即可导入必应关键词。">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className="input" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <input className="input" placeholder="https://example.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn" onClick={() => saveBingFn({ data: { domain, apiKey, siteUrl } }).then(onSaved).catch((e) => setErr(e instanceof Error ? e.message : "保存失败"))}>保存 Bing</button>
          {data.bing ? <button type="button" className="btn btn-danger" onClick={() => removeBingFn({ data: { domain } }).then(onSaved)}>断开</button> : null}
        </div>
        {data.bing ? <p className="mt-2 text-sm text-gray-500">已连接 {data.bing.site_url}</p> : null}
      </Tile>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  )
}
