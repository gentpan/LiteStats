import { Surface } from "~/components/Surface"
import { TrackingSnippet } from "~/components/TrackingSnippet"
import { SettingsNav } from "~/components/SettingsNav"
import { ActionButton } from "~/components/ActionButton"
import { UIIcon as TabIcon, BrandIcon } from "~/components/UIIcon"
import { SettingsLayout } from "~/components/SettingsLayout"
import { SettingsForm, Field, FormActions } from "~/components/SettingsForm"
import { MapSettingsPanel } from "~/components/MapSettingsPanel"
import { Navigate } from "@tanstack/react-router"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useMemo, useEffect, useState } from "react"
import { SiteMonitorPanel } from "~/components/SiteMonitorPanel"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { Tile } from "~/components/ui"
import { useT } from "~/lib/i18n"
import { timezoneOptions } from "~/lib/timezones"
import {
  createShareFn,
  meFn,
  removeShareFn,
  removeSiteFn,
  removeBingFn,
  removeGoogleFn,
  saveBingFn,
  saveGooglePropertyFn,
  saveGoogleOAuthConfigFn,
  saveSettingsFn,
  siteSettingsFn,
} from "~/lib/actions"

const TABS = [
  { id: "general", label: "常规", icon: "rocket" },
  { id: "map", label: "地图", icon: "map" },
  { id: "monitor", label: "监控", icon: "activity" },
  { id: "visibility", label: "可见性", icon: "eye" },
  { id: "installation", label: "安装脚本", icon: "code" },
  { id: "integrations", label: "集成", icon: "puzzle" },
  { id: "imports-exports", label: "导入与导出", icon: "download" },
  { id: "shields", label: "屏蔽", icon: "shield" },
  { id: "email-reports", label: "邮件报告", icon: "mail" },
  { id: "danger-zone", label: "危险操作", icon: "warn" },
]


export const Route = createFileRoute("/sites/$domain/settings")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: String(s.tab || "").startsWith("shields/") ? "shields" : TABS.some(item => item.id === s.tab) ? String(s.tab) : "general" }),
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
  const [name, setName] = useState(data.site.name || "")
  const [timezone, setTimezone] = useState(data.site.timezone || "Asia/Shanghai")
  const ZONES = useMemo(() => timezoneOptions(timezone), [timezone])
  const [newDomain, setNewDomain] = useState(domain)
  const [isPublic, setIsPublic] = useState(!!data.site.public)
  const [shareName, setShareName] = useState(t("公开报表"))
  const [ok, setOk] = useState("")
  useEffect(() => { setOk("") }, [tab])

  if (!me) {
    return <Navigate to="/login" />
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const snippet = `<script defer data-domain="${domain}" src="${origin}/script.js"></script>`

  return (
    <Shell user={me}>
      <Surface radius="large" className="site-settings-workspace">
        <SettingsHeader
          title={t("settings.site_for")}
          domain={domain}
          name={name || data.site.name || ""}
          back={(
            <Link to="/sites/$domain" params={{ domain }} className="btn btn-secondary btn-sm settings-back">
              <BackArrow />
              {t("settings.back_stats")}
            </Link>
          )}
        />
        <SettingsLayout navigationTitle={t(TABS.find(item=>item.id===tab)?.label || "设置")} sidebar={<SettingsNav label={t("站点设置")}>
          {TABS.map(item => <Link key={item.id} to="/sites/$domain/settings" params={{domain}} search={{tab:item.id}} aria-current={tab === item.id ? "page" : undefined} className={`settings-nav-link${tab === item.id ? " is-active" : ""}`}><TabIcon name={item.icon} />{t(item.label)}</Link>)}
        </SettingsNav>}>
            {ok ? <p className="text-sm text-indigo-600">{t(ok || "")}</p> : null}

            {tab === "map" ? <MapSettingsPanel domain={domain} initial={data.mapConfig} onSaved={() => router.invalidate()} /> : null}

            {tab === "monitor" ? <SiteMonitorPanel domain={domain} initial={data.monitor} onSaved={() => router.invalidate()} /> : null}

            {tab === "general" ? <Tile icon="globe" title={t("站点详情")} subtitle={t("管理这个站点的基本配置。")}>
              <SettingsForm onSubmit={async event => {
                event.preventDefault()
                const saved = await saveSettingsFn({data:{domain,name,timezone,newDomain,public:data.site.public}})
                if (saved.domain !== domain) await router.navigate({to:"/sites/$domain/settings",params:{domain:saved.domain},search:{tab:"general"}})
                else await router.invalidate()
                setOk(t("设置已保存"))
              }}>
                <Field label={t("站点名称")} hint={t("在站点列表中显示，留空则默认使用域名。")}><input className="input" placeholder={domain} value={name} onChange={event=>setName(event.target.value)} /></Field>
                <Field label={t("站点域名")}><input className="input" value={newDomain} onChange={event=>setNewDomain(event.target.value)} required /></Field>
                <Field label={t("报表时区")}><select className="input" value={timezone} onChange={event=>setTimezone(event.target.value)}>
                  {ZONES.some(zone=>zone.value === timezone) ? null : <option value={timezone}>{timezone}</option>}
                  {ZONES.map(zone=><option key={zone.value} value={zone.value}>{t(zone.label)}</option>)}
                </select></Field>
                <FormActions><ActionButton className="btn btn-primary" type="submit">{t("保存设置")}</ActionButton></FormActions>
              </SettingsForm>
            </Tile> : null}

            {tab === "visibility" ? (
              <div>
                <Tile icon="eye" title={t("公开仪表盘")} subtitle={t("把统计公开，或者继续保持私密。")}>
                  <SettingsForm onSubmit={async event=>{event.preventDefault();await saveSettingsFn({data:{domain,timezone:data.site.timezone,public:isPublic}});await router.invalidate();setOk(t("设置已保存"))}}>
                    <label className="flex items-center gap-3 text-sm text-gray-800"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)} />{t("公开这个站点的仪表盘")}</label>
                    <FormActions><ActionButton className="btn btn-primary" type="submit">{t("保存设置")}</ActionButton></FormActions>
                  </SettingsForm>
                </Tile>
                <Tile icon="plug" title={t("共享链接")} subtitle={t("生成不需登录就能打开的报表链接。")}>
                  <SettingsForm
                    className="mb-4"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      await createShareFn({ data: { domain, name: shareName } })
                      setShareName(t("公开报表"))
                      await router.invalidate()
                    }}
                  >
                    <Field label={t("共享链接名称")}><input className="input" value={shareName} onChange={(e) => setShareName(e.target.value)} /></Field>
                    <FormActions><ActionButton icon="plus" className="btn btn-primary" type="submit">{t("创建")}</ActionButton></FormActions>
                  </SettingsForm>
                  <ul className="space-y-2 text-sm">
                    {data.shares.map((s) => (
                      <li key={s.id} className="flex flex-wrap justify-between gap-3 break-all">
                        <a className="text-indigo-600 hover:text-indigo-500" href={`/share/${s.slug}`}>{s.name} · /share/{s.slug}<TabIcon name="arrow" /></a>
                        <ActionButton className="text-red-600" type="button" onClick={async () => { await removeShareFn({ data: { domain, id: s.id } }); await router.invalidate() }}>{t("删除")}</ActionButton>
                      </li>
                    ))}
                  </ul>
                </Tile>
              </div>
            ) : null}

            {tab === "installation" ? (
              <div>
                <Tile icon="code" title={t("埋点脚本")} subtitle={t("把这段代码放到网站的 <head> 里。默认会记录页面浏览、外链点击、文件下载，以及标题、语言和屏幕分辨率。")}>
                  <TrackingSnippet code={snippet} />
                </Tile>
              </div>
            ) : null}

            {tab === "integrations" ? <Integrations data={data} domain={domain} onSaved={() => router.invalidate()} /> : null}

            {tab === "imports-exports" ? (
              <Tile icon="download" title={t("导入与导出")} subtitle={t("按报表所选时间范围导出访问统计。")}>
                <p className="text-sm text-gray-500">{t("在统计页选择时间范围，再通过更多菜单导出报表。暂不支持外部数据导入。")}</p>
                <Link to="/sites/$domain" params={{domain}} className="btn btn-secondary mt-4"><TabIcon name="activity" />{t("打开统计报表")}<TabIcon name="arrow" /></Link>
              </Tile>
            ) : null}

            {tab.startsWith("shields") ? (
              <Tile icon="shield" title={t("屏蔽")} subtitle={t("屏蔽指定 IP、国家/地区、页面或主机名的流量。")}>
                <p className="text-sm text-gray-500">{t("还没有屏蔽规则。采集层会在后续版本接上这些名单。")}</p>
              </Tile>
            ) : null}

            {tab === "email-reports" ? (
              <Tile icon="mail" title={t("邮件报告")} subtitle={t("按周或按月把统计发到邮箱。")}>
                <p className="text-sm text-gray-500">{t("邮件服务统一在系统设置中配置；定时报告发送任务尚未接入。") }</p>
                {me.isAdmin ? <Link to="/account" search={{tab:"system/email"}} className="btn btn-secondary mt-4"><TabIcon name="mail" />{t("配置邮件服务")}<TabIcon name="arrow" /></Link> : null}
              </Tile>
            ) : null}

            {tab === "danger-zone" ? (
              <div>
                <div className="settings-danger-notice">
                  <h3 className="text-sm font-medium text-gray-900">{t("危险操作")}</h3>
                  <p className="mt-1 text-sm text-gray-600">{t("下面的操作会造成无法恢复的数据丢失，请谨慎。")}</p>
                </div>
                <Tile icon="warn" title={t("删除站点")} subtitle={t("永久删除站点设置。历史事件仍留在 ClickHouse。")}>
                  <ActionButton
                    className="btn btn-danger"
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(t("确认删除 {0}？", {0: domain}))) return
                      await removeSiteFn({ data: { domain } })
                      await router.navigate({ to: "/" })
                    }}
                  >{t("删除站点")}
                  </ActionButton>
                </Tile>
              </div>
            ) : null}
        </SettingsLayout>
      </Surface>
    </Shell>
  )
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
  const { t } = useT()
  const [clientId, setClientId] = useState(data.googleOAuth.clientId)
  const [clientSecret, setClientSecret] = useState("")
  const [redirectUri, setRedirectUri] = useState(data.googleOAuth.redirectUri)
  const [configSaved, setConfigSaved] = useState(false)
  useEffect(() => { if (!data.googleOAuth.redirectUri) setRedirectUri(`${window.location.origin}/api/auth/google`) }, [data.googleOAuth.redirectUri])
  const [apiKey, setApiKey] = useState("")
  const [siteUrl, setSiteUrl] = useState(data.bing?.site_url || `https://${domain}`)
  const [property, setProperty] = useState(data.google?.property || "")
  const [err, setErr] = useState("")
  return (
    <div className="search-integrations">
      <Tile brand="google" title={t("Google 搜索词")} subtitle={t("查看来自 Google 搜索的关键词与点击数据。")}>
        <div className="integration-status-line"><span className={`integration-status${data.google ? " is-connected" : ""}`}>{t(data.google ? "已连接" : data.googleOAuth.configured ? "待授权" : "未配置")}</span><span>Google Search Console</span></div>
        <SettingsForm className="integration-form google-oauth-form" onSubmit={async () => {
          setConfigSaved(false)
          await saveGoogleOAuthConfigFn({data:{domain,clientId,clientSecret,redirectUri}})
          setClientSecret("")
          setConfigSaved(true)
          onSaved()
        }}>
          <div className="integration-fields">
            <Field label="Client ID"><input className="input" required value={clientId} placeholder="…apps.googleusercontent.com" onChange={e=>{setClientId(e.target.value);setConfigSaved(false)}} /></Field>
            <Field label="Client Secret" hint={t(data.googleOAuth.hasSecret ? "已保存密钥，留空保持不变。" : "填写 Google OAuth 客户端密钥。") }><input className="input" type="password" autoComplete="new-password" required={!data.googleOAuth.hasSecret} value={clientSecret} onChange={e=>{setClientSecret(e.target.value);setConfigSaved(false)}} /></Field>
          </div>
          <Field label={t("授权回调地址")} hint={t("将此地址原样添加到 Google Cloud 的已获授权重定向 URI。") }><input className="input" type="url" required value={redirectUri} onChange={e=>{setRedirectUri(e.target.value);setConfigSaved(false)}} /></Field>
          <FormActions><ActionButton type="submit" className="btn btn-primary">{t("保存配置")}</ActionButton>{configSaved ? <span role="status" className="text-sm text-indigo-600">{t("配置已保存")}</span> : null}</FormActions>
        </SettingsForm>
        {data.google ? (
          <SettingsForm onSubmit={async () => {setErr("");await saveGooglePropertyFn({data:{domain,property}});onSaved()}}>
            <p className="settings-status">{t("已连接")} · {data.google.email}</p>
            <Field label={t("选择资源")}>
            {data.google.properties.length ? (
              <select aria-label={t("选择资源")} className="input" value={property} onChange={(e) => setProperty(e.target.value)}>
                <option value="">{t("选择资源")}</option>
                {data.google.properties.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input aria-label={t("选择资源")} className="input" value={property} placeholder="sc-domain:example.com" onChange={(e) => setProperty(e.target.value)} />
            )}
            </Field>
            <FormActions>
              <ActionButton type="submit" className="btn btn-primary">{t("保存资源")}</ActionButton>
              <ActionButton type="button" className="btn btn-danger" icon="plug" onClick={() => removeGoogleFn({ data: { domain } }).then(onSaved).catch(e => setErr(e instanceof Error ? e.message : t("保存失败")))}>{t("断开")}</ActionButton>
            </FormActions>
          </SettingsForm>
        ) : data.googleOAuth.configured ? (
          <a title={t("连接 Google Search Console")} className="btn btn-secondary inline-flex" href={data.googleAuthUrl}><BrandIcon name="google" />{t("连接 Google")}</a>
        ) : null        }
      </Tile>
      <Tile brand="bing" title={t("Bing 搜索词")} subtitle={t("连接 Bing Webmaster，查看必应搜索关键词。")}>
        <div className="integration-status-line"><span className={`integration-status${data.bing ? " is-connected" : ""}`}>{t(data.bing ? "已配置" : "未配置")}</span><span>{data.bing?.site_url || "Bing Webmaster Tools"}</span></div>
        <SettingsForm className="integration-form" onSubmit={async event=>{event.preventDefault();await saveBingFn({data:{domain,apiKey,siteUrl}});onSaved()}}>
          <div className="integration-fields">
          <Field label="API Key" hint={t("填写 Bing Webmaster 提供的密钥。")}><input placeholder={t("输入 API Key")} className="input" type="password" autoComplete="off" required value={apiKey} onChange={event=>setApiKey(event.target.value)} /></Field>
          <Field label={t("站点地址")} hint={t("与 Bing 中验证的站点地址保持一致。")}><input className="input" type="url" required value={siteUrl} onChange={event=>setSiteUrl(event.target.value)} /></Field>
          </div>
          <FormActions><ActionButton className="btn btn-primary" type="submit">{t("保存配置")}</ActionButton>
            {data.bing ? <ActionButton type="button" className="btn btn-danger" onClick={()=>removeBingFn({data:{domain}}).then(onSaved).catch(e=>setErr(e instanceof Error ? e.message : t("保存失败")))}>{t("断开")}</ActionButton> : null}
          </FormActions>
        </SettingsForm>
      </Tile>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  )
}
