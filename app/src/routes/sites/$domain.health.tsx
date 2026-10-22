import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Shell } from "~/components/Shell"
import { ManagementHeader } from "~/components/ManagementHeader"
import { PageState } from "~/components/PageState"
import { SiteHealthPanel } from "~/components/SiteHealthPanel"
import { meFn } from "~/lib/actions"
import { siteCheckFn, runSiteCheckFn, saveSiteCheckFn } from "~/lib/site-check-actions"
import { useT } from "~/lib/i18n"
import "~/styles/site-health.css"

export const Route = createFileRoute("/sites/$domain/health")({
  loader: async ({params}) => {
    const me = await meFn()
    if (!me) throw redirect({to: "/login"})
    return {me, data: await siteCheckFn({data: {domain: params.domain}})}
  },
  component: SiteHealthPage,
  errorComponent: ({error}) => <PageState title="页面出错" description={error instanceof Error ? error.message : undefined}/>,
})

function SiteHealthPage() {
  const {me, data} = Route.useLoaderData()
  const {domain} = Route.useParams()
  const {t} = useT()
  const router = useRouter()
  const [path, setPath] = useState(data.report.path)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {setPath(data.report.path)}, [data.report.path])
  useEffect(() => {
    let refreshing = false
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || refreshing || pending) return
      refreshing = true
      void router.invalidate().catch(() => setError(t("刷新失败，请重试"))).finally(() => {refreshing = false})
    }, 30_000)
    return () => clearInterval(timer)
  }, [router, pending, t])
  async function perform(action: () => Promise<unknown>) {
    setPending(true); setError("")
    try { await action(); await router.invalidate() }
    catch (error) {setError(error instanceof Error ? error.message : t("检查失败，请稍后重试"))}
    finally {setPending(false)}
  }
  return <Shell user={me}>
    <ManagementHeader title={t("站点检查")} description={`${domain} · ${t("网站可用性、域名与证书到期时间")}`}>
      <Link to="/sites/$domain" params={{domain}} className="squircle btn">{t("返回统计")}</Link>
      {data.canManage ? <button className="squircle btn btn-primary" disabled={pending} onClick={() => void perform(() => data.report.enabled ? runSiteCheckFn({data: {domain}}) : saveSiteCheckFn({data: {domain, enabled: true, path}}))}>{t(pending ? "检查中…" : data.report.enabled ? "立即检查" : "开启检查")}</button> : null}
    </ManagementHeader>
    {error ? <p role="alert" className="squircle settings-feedback is-error">{t(error)}</p> : null}
    <SiteHealthPanel report={data.report}/>
    {data.canManage ? <details className="health-settings"><summary>{t("检查设置")}</summary>
      <form onSubmit={event => {event.preventDefault(); void perform(() => saveSiteCheckFn({data: {domain, enabled: data.report.enabled, path}}))}}>
        <label>{t("检查路径")}<div className="health-path"><span>{`https://${domain}`}</span><input className="squircle input" aria-label={t("检查路径")} required maxLength={2048} value={path} onChange={event => setPath(event.target.value)} placeholder="/"/></div></label>
        <p>{t("每 5 分钟访问一次，跟随跳转后返回 HTTP 200 视为正常。无需安装探针或统计脚本。")}</p>
        <div><button className="squircle btn" type="submit" disabled={pending}>{t("保存设置")}</button>{data.report.enabled ? <button className="squircle btn" type="button" disabled={pending} onClick={() => void perform(() => saveSiteCheckFn({data: {domain, enabled: false, path: data.report.path}}))}>{t("暂停检查")}</button> : null}</div>
      </form>
    </details> : null}
  </Shell>
}
