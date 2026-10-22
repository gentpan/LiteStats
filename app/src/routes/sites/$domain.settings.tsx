import { Surface } from "~/components/Surface"
import { TrackingDocs } from "~/components/TrackingDocs"
import { TrackingSnippet } from "~/components/TrackingSnippet"
import { SettingsNav } from "~/components/SettingsNav"
import { ActionButton } from "~/components/ActionButton"
import { UIIcon as TabIcon, BrandIcon } from "~/components/UIIcon"
import { SettingsLayout } from "~/components/SettingsLayout"
import { SettingsForm, Field, FormActions } from "~/components/SettingsForm"
import { Navigate } from "@tanstack/react-router"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useMemo, useEffect, useId, useState, type ReactNode } from "react"
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

import { SITE_TABS as TABS, siteTab } from "~/lib/settings-tabs"
import type { GoogleOAuthIssue } from "~/lib/google-oauth-flow"
import "~/styles/search-integrations.css"

const oauthMessages: Record<GoogleOAuthIssue, string> = {
  denied: "已取消 Google 授权，尚未连接。准备好后可再次点击“连接 Google”。",
  expired: "Google 授权链接已过期或已被使用，请重新点击“连接 Google”。",
  auth_error: "Google 授权未能完成，请检查客户端配置，并使用有本站访问权限的账号重新连接。",
  failed: "暂时无法完成 Google 连接，请稍后重试；若持续失败，请检查客户端配置和网络连接。",
}

function oauthIssue(value: unknown): GoogleOAuthIssue | undefined {
  return typeof value === "string" && Object.hasOwn(oauthMessages, value) ? value as GoogleOAuthIssue : undefined
}

export const Route = createFileRoute("/sites/$domain/settings")({
  validateSearch: (s: Record<string, unknown>): {tab: ReturnType<typeof siteTab>, gsc?: GoogleOAuthIssue} => ({tab: siteTab(s.tab), gsc: oauthIssue(s.gsc)}),
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
  const { tab, gsc } = Route.useSearch()
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

  const [origin, setOrigin] = useState("")
  useEffect(() => { setOrigin(window.location.origin) }, [])

  if (!me) {
    return <Navigate to="/login" />
  }

  const snippet = `<script defer data-domain="${domain}" src="${origin}/script.js"></script>`

  return (
    <Shell user={me}>
      <Surface radius="large" className="site-settings-workspace">
        <SettingsHeader
          title={t("settings.site_for")}
          domain={domain}
          name={name || data.site.name || ""}
          back={(
            <Link to="/sites/$domain" params={{ domain }} className="squircle btn btn-secondary btn-sm settings-back">
              <BackArrow />
              {t("settings.back_stats")}
            </Link>
          )}
        />
        <SettingsLayout navigationTitle={t(TABS.find(item=>item.id===tab)?.label || "设置")} sidebar={<SettingsNav label={t("站点设置")}>
          {TABS.map(item => <Link key={item.id} to="/sites/$domain/settings" params={{domain}} search={{tab:item.id}} aria-current={tab === item.id ? "page" : undefined} className={`squircle settings-nav-link${tab === item.id ? " is-active" : ""}`}><TabIcon name={item.icon} />{t(item.label)}</Link>)}
        </SettingsNav>}>
            {ok ? <p className="text-sm text-indigo-600">{t(ok || "")}</p> : null}


            {tab === "general" ? <Tile icon="globe" title={t("站点详情")} subtitle={t("管理这个站点的基本配置。")}>
              <SettingsForm onSubmit={async event => {
                event.preventDefault()
                const saved = await saveSettingsFn({data:{domain,name,timezone,newDomain,public:data.site.public}})
                if (saved.domain !== domain) await router.navigate({to:"/sites/$domain/settings",params:{domain:saved.domain},search:{tab:"general"}})
                else await router.invalidate()
                setOk(t("设置已保存"))
              }}>
                <Field label={t("站点名称")} hint={t("在站点列表中显示，留空则默认使用域名。")}><input className="squircle input" placeholder={domain} value={name} onChange={event=>setName(event.target.value)} /></Field>
                <Field label={t("站点域名")}><input className="squircle input" value={newDomain} onChange={event=>setNewDomain(event.target.value)} required /></Field>
                <Field label={t("报表时区")}><select className="squircle input" value={timezone} onChange={event=>setTimezone(event.target.value)}>
                  {ZONES.some(zone=>zone.value === timezone) ? null : <option value={timezone}>{timezone}</option>}
                  {ZONES.map(zone=><option key={zone.value} value={zone.value}>{t(zone.label)}</option>)}
                </select></Field>
                <FormActions><ActionButton className="btn btn-primary" type="submit">{t("保存设置")}</ActionButton></FormActions>
              </SettingsForm>
            </Tile> : null}

            {tab === "visibility" ? (
              <div>
                <Tile icon="eye" title={t("公开仪表盘")} subtitle={t("把统计公开，或者继续保持私密。")}>
                  <SettingsForm onSubmit={async event=>{event.preventDefault();await saveSettingsFn({data:{domain,public:isPublic}});await router.invalidate();setOk(t("设置已保存"))}}>
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
                    <Field label={t("共享链接名称")}><input className="squircle input" value={shareName} onChange={(e) => setShareName(e.target.value)} /></Field>
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
                  <TrackingDocs domain={domain} />
                </Tile>
              </div>
            ) : null}

            {tab === "integrations" ? <Integrations data={data} domain={domain} oauthIssue={gsc} onSaved={() => router.invalidate()} /> : null}

            {tab === "danger-zone" ? (
              <div>
                <div className="squircle settings-danger-notice">
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


function IntegrationSection({ provider, title, description, status, connected, children }: {
  provider: "google" | "bing"
  title: string
  description: string
  status: string
  connected: boolean
  children: ReactNode
}) {
  const titleId = useId()
  return <section className="search-integration-section" aria-labelledby={titleId}>
    <header className="search-integration-heading">
      <div className="search-integration-title">
        <BrandIcon name={provider} />
        <div><h2 id={titleId}>{title}</h2><p>{description}</p></div>
      </div>
      <span className={`squircle integration-status${connected ? " is-connected" : ""}`}>{status}</span>
    </header>
    <div className="search-integration-body">{children}</div>
  </section>
}

function Integrations({
  data,
  domain,
  oauthIssue,
  onSaved,
}: {
  data: Awaited<ReturnType<typeof siteSettingsFn>>
  domain: string
  oauthIssue?: GoogleOAuthIssue
  onSaved: () => void
}) {
  const { t } = useT()
  const [clientId, setClientId] = useState(data.googleOAuth.clientId)
  const [clientSecret, setClientSecret] = useState("")
  const [redirectUri, setRedirectUri] = useState(data.googleOAuth.redirectUri)
  const [configSaved, setConfigSaved] = useState(false)
  useEffect(() => { if (!data.googleOAuth.redirectUri) setRedirectUri(`${window.location.origin}/api/auth/google`) }, [data.googleOAuth.redirectUri])
  const [apiKey, setApiKey] = useState("")
  const [bingSaved, setBingSaved] = useState(false)
  const [siteUrl, setSiteUrl] = useState(data.bing?.site_url || `https://${domain}`)
  const [property, setProperty] = useState(data.google?.property || "")
  const [err, setErr] = useState("")
  return (
    <div className="search-integrations">
      {oauthIssue ? <Surface radius="medium" role="alert" className="bg-gray-100 p-3 text-sm leading-relaxed text-gray-700">{t(oauthMessages[oauthIssue])}</Surface> : null}
      <p className="search-integrations-intro">{t("连接已验证站点的站长平台后，可查看汇总关键词和搜索点击量，无法对应到单个访客；部分低频词不会公开。")}</p>
      <IntegrationSection provider="google" title={t("Google 搜索词")} description={t("查看来自 Google 搜索的关键词与点击数据。")} status={t(data.google ? "已连接" : data.googleOAuth.configured ? "待授权" : "未配置")} connected={!!data.google}>
        {data.googleOAuth.error ? <p role="alert" className="text-sm text-red-600">{t(data.googleOAuth.error)}</p> : null}
        <div className="search-integration-help">
          <p>{t("Google 搜索词需要 OAuth 只读授权，普通 API Key 无法读取 Search Console 数据。")}</p>
          <p>{t("先在 Google Cloud 启用 Search Console API，创建 Web 应用 OAuth 客户端，并添加下方回调地址。保存配置后连接 Google，再选择本站对应的资源。")}</p>
          <a className="search-integration-docs" href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing" target="_blank" rel="noopener noreferrer">{t("查看 Google 官方接入说明")}<TabIcon name="arrow" /></a>
        </div>
        <SettingsForm className="integration-form google-oauth-form" onSubmit={async () => {
          setConfigSaved(false)
          await saveGoogleOAuthConfigFn({data:{domain,clientId,clientSecret,redirectUri}})
          setClientSecret("")
          setConfigSaved(true)
          onSaved()
        }}>
          <div className="integration-fields">
            <Field label="Client ID"><input className="squircle input" required value={clientId} placeholder="…apps.googleusercontent.com" onChange={e=>{setClientId(e.target.value);setConfigSaved(false)}} /></Field>
            <Field label="Client Secret" hint={t(data.googleOAuth.hasSecret && clientId === data.googleOAuth.clientId ? "已保存密钥，留空保持不变。" : "填写 Google OAuth 客户端密钥。") }><input className="squircle input" type="password" autoComplete="new-password" required={!data.googleOAuth.hasSecret || clientId !== data.googleOAuth.clientId} value={clientSecret} onChange={e=>{setClientSecret(e.target.value);setConfigSaved(false)}} /></Field>
          </div>
          <Field label={t("授权回调地址")} hint={t("将此地址原样添加到 Google Cloud 的已获授权重定向 URI。") }><input className="squircle input" type="url" required value={redirectUri} onChange={e=>{setRedirectUri(e.target.value);setConfigSaved(false)}} /></Field>
          <FormActions><ActionButton type="submit" className="btn btn-primary">{t("保存配置")}</ActionButton>{configSaved ? <span role="status" className="text-sm text-indigo-600">{t("配置已保存")}</span> : null}</FormActions>
        </SettingsForm>
        {data.google ? (
          <SettingsForm className="integration-form search-integration-connection" onSubmit={async () => {setErr("");await saveGooglePropertyFn({data:{domain,property}});onSaved()}}>
            <p className="search-integration-account">{t("已连接")} · {data.google.email}</p>
            <Field label={t("选择资源")}>
            {data.google.properties.length ? (
              <select aria-label={t("选择资源")} className="squircle input" value={property} onChange={(e) => setProperty(e.target.value)}>
                <option value="">{t("选择资源")}</option>
                {data.google.properties.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input aria-label={t("选择资源")} className="squircle input" value={property} placeholder="sc-domain:example.com" onChange={(e) => setProperty(e.target.value)} />
            )}
            </Field>
            <FormActions>
              <ActionButton type="submit" className="btn btn-primary">{t("保存资源")}</ActionButton>
              <ActionButton type="button" className="btn btn-danger" icon="plug" onClick={() => removeGoogleFn({ data: { domain } }).then(onSaved).catch(e => setErr(e instanceof Error ? e.message : t("保存失败")))}>{t("断开")}</ActionButton>
            </FormActions>
          </SettingsForm>
        ) : data.googleOAuth.configured ? (
          <div className="search-integration-connection"><a title={t("连接 Google Search Console")} className="squircle btn btn-secondary inline-flex" href={data.googleAuthUrl}><BrandIcon name="google" />{t("连接 Google")}</a></div>
        ) : null        }
      </IntegrationSection>
      <IntegrationSection provider="bing" title={t("Bing 搜索词")} description={t("连接 Bing Webmaster，查看必应搜索关键词。")} status={t(data.bing ? "已配置" : "未配置")} connected={!!data.bing}>
        <p className="search-integration-help">{t("在 Bing Webmaster Tools 中获取 API Key，使用本站在平台中验证过的完整地址。保存后密钥输入框会清空，已保存的密钥不会回显。")}</p>
        <SettingsForm className="integration-form" onSubmit={async event=>{event.preventDefault();setBingSaved(false);await saveBingFn({data:{domain,apiKey,siteUrl}});setApiKey("");setBingSaved(true);onSaved()}}>
          <div className="integration-fields">
          <Field label="API Key" hint={t("填写 Bing Webmaster 提供的密钥。")}><input placeholder={t("输入 API Key")} className="squircle input" type="password" autoComplete="off" required value={apiKey} onChange={event=>{setApiKey(event.target.value);setBingSaved(false)}} /></Field>
          <Field label={t("站点地址")} hint={t("与 Bing 中验证的站点地址保持一致。")}><input className="squircle input" type="url" required value={siteUrl} onChange={event=>{setSiteUrl(event.target.value);setBingSaved(false)}} /></Field>
          </div>
          <FormActions><ActionButton className="btn btn-primary" type="submit">{t("保存配置")}</ActionButton>
            {data.bing ? <ActionButton type="button" className="btn btn-danger" onClick={()=>{setBingSaved(false);return removeBingFn({data:{domain}}).then(onSaved).catch(e=>setErr(e instanceof Error ? e.message : t("保存失败")))}}>{t("断开")}</ActionButton> : null}
            {bingSaved ? <span role="status" className="text-sm text-indigo-600">{t("配置已保存")}</span> : null}
          </FormActions>
        </SettingsForm>
      </IntegrationSection>
      {err ? <p role="alert" className="text-sm text-red-500">{err}</p> : null}
    </div>
  )
}
