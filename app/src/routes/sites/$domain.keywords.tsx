import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { Shell } from "~/components/Shell"
import { ManagementHeader } from "~/components/SettingsChrome"
import { HelpHint } from "~/components/HelpHint"
import { PageState } from "~/components/PageState"
import { ActionLink } from "~/components/ActionButton"
import { KeywordTable } from "~/components/KeywordTable"
import { KeywordImportPanel } from "~/components/KeywordImportPanel"
import { KeywordSeoPanel } from "~/components/KeywordSeoPanel"
import { meFn } from "~/lib/actions"
import { keywordImportsFn, keywordImportFn } from "~/lib/keyword-import-actions"
import { keywordLiveFn, generateKeywordSeoFn } from "~/lib/keyword-workspace-actions"
import { seoAiSettingsFn, seoAiHistoryFn } from "~/lib/seo-ai-actions"
import type { KeywordImportBatch } from "~/lib/keyword-import"
import type { KeywordPack } from "~/lib/keyword-report"
import type { SeoAiReport } from "~/lib/seo-ai"
import { rangeFromSearch } from "~/lib/range"
import { isDateRange } from "~/lib/date-time"
import { useT } from "~/lib/i18n"
import "~/styles/keywords.css"

type WorkspaceData = {
  me: Awaited<ReturnType<typeof meFn>>
  imports: Awaited<ReturnType<typeof keywordImportsFn>>
  range: {from: string; to: string}
  google: KeywordPack
  config: Awaited<ReturnType<typeof seoAiSettingsFn>> | null
  history: SeoAiReport[]
  aiWarning: string
}

export const Route = createFileRoute("/sites/$domain/keywords")({
  loader: async ({params}) => {
    const me = await meFn()
    if (!me) throw redirect({to: "/login"})
    const imports = await keywordImportsFn({data: {domain: params.domain}})
    const range = rangeFromSearch({period: "28d"}, "America/Los_Angeles")
    const [google, ai] = await Promise.all([
      keywordLiveFn({data: {domain: params.domain, provider: "google", from: range.from, to: range.to}}),
      imports.canManage ? Promise.allSettled([seoAiSettingsFn({data: {domain: params.domain}}), seoAiHistoryFn({data: {domain: params.domain}})]) : null,
    ])
    const config = ai?.[0].status === "fulfilled" ? ai[0].value : imports.canManage ? {endpoint: "https://api.openai.com/v1/chat/completions", model: "", hasKey: false, tokenParameter: "max_completion_tokens" as const} : null
    const history = ai?.[1].status === "fulfilled" ? ai[1].value.reports : []
    const aiWarning = ai?.some(item => item.status === "rejected") ? "部分 AI 配置或历史无法读取。关键词报告仍可使用；配置异常时请重新填写接口和密钥。"
      : ai?.[1].status === "fulfilled" && ai[1].value.unreadableCount ? "部分历史建议无法解密，已保留原记录；当前显示可读取的建议。" : ""
    return {me, imports, range, google, config, history, aiWarning}
  },
  component: KeywordsPage,
  errorComponent: ({error}) => <PageState title="页面出错" description={error instanceof Error ? error.message : undefined}/>,
})

function KeywordsPage() {
  const data = Route.useLoaderData()
  const {domain} = Route.useParams()
  return <KeywordWorkspace key={domain} domain={domain} data={data}/>
}

function KeywordWorkspace({domain, data}: {domain: string; data: WorkspaceData}) {
  const {t} = useT()
  const [source, setSource] = useState<"google" | "bing" | "import">("google")
  const [pack, setPack] = useState<KeywordPack | null>(data.google)
  const [from, setFrom] = useState(data.range.from)
  const [to, setTo] = useState(data.range.to)
  const [range, setRange] = useState(data.range)
  const [batches, setBatches] = useState(data.imports.batches)
  const [batch, setBatch] = useState<KeywordImportBatch | null>(data.imports.latest)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const request = useRef(0)
  const canManage = data.imports.canManage
  const rows = source === "import" ? batch?.rows || [] : pack?.metrics || []
  const label = source === "import" ? batch ? `${batch.provider === "google" ? "Google" : "Bing"} · ${batch.from} – ${batch.to} · CSV #${batch.id}` : t("尚未导入报告")
    : source === "google" ? `Google · ${range.from} – ${range.to}` : `Bing · ${t("接口可用范围")}`
  async function load(provider: "google" | "bing") {
    const id = ++request.current
    setSource(provider); setLoading(true); setError(""); setPack(null)
    try {
      const requestedRange = provider === "bing" ? range : {from, to}
      const result = await keywordLiveFn({data: {domain, provider, ...requestedRange}})
      if (id === request.current) {setPack(result); setRange(requestedRange)}
    } catch (err) {if (id === request.current) setError(err instanceof Error ? err.message : t("加载失败，请重试"))}
    finally {if (id === request.current) setLoading(false)}
  }
  function imported(next: KeywordImportBatch) {
    request.current++; setLoading(false); setError(""); setSource("import"); setBatch(next)
    const {rows: _rows, ...summary} = next
    setBatches(items => [summary, ...items].slice(0, 30))
  }
  const liveMessage = !pack?.configured ? t(source === "google" ? "连接 Google Search Console 后可读取真实搜索词；也可以先导入 CSV。" : "填写 Bing Webmaster API Key 后可读取搜索词；也可以先导入 CSV。")
    : pack.error ? t(({auth_error: "授权已失效或没有该资源的访问权限，请检查接入设置。", property_required: "Google 已授权，请选择并保存本站对应的 Search Console 资源。", request_timeout: "搜索平台响应超时，请稍后重试。"} as Record<string, string>)[pack.error] || "搜索平台暂时无法读取，请稍后重试。")
    : t("当前范围暂无关键词。最近的数据可能延迟，部分低频查询不会公开。")
  return <Shell user={data.me}>
    <ManagementHeader title={t("搜索关键词")} description={domain}>
      <ActionLink to="/sites/$domain" params={{domain}}>{t("返回统计")}</ActionLink>
      {canManage ? <ActionLink to="/sites/$domain/settings" params={{domain}} search={{tab: "integrations"}}>{t("接入设置")}</ActionLink> : null}
    </ManagementHeader>
    <div className="keyword-workspace">
      <section className="squircle keyword-card" aria-label={t("关键词报告")}>
        <div className="keyword-card-title"><div className="keyword-tabs" role="group" aria-label={t("报告来源")}>
          {(["google", "bing", "import"] as const).map(value => <button className="squircle btn" type="button" aria-pressed={source === value} key={value} onClick={() => {
            if (source === value) return
            if (value === "import") {request.current++; setLoading(false); setError(""); setSource(value)} else void load(value)
          }}>{value === "google" ? "Google" : value === "bing" ? "Bing" : t("已导入")}</button>)}
        </div></div>
        {source !== "import" ? <form className="keyword-range" onSubmit={event => {event.preventDefault(); void load(source)}}>
          {source === "google" ? <><label>{t("开始日期")}<input className="squircle input" type="date" required value={from} onInput={event => setFrom(event.currentTarget.value)}/></label><label>{t("结束日期")}<input className="squircle input" type="date" min={from || undefined} required value={to} onInput={event => setTo(event.currentTarget.value)}/></label></> : null}
          <button className="squircle btn" disabled={loading || source === "google" && !isDateRange(from, to)} type="submit">{t(loading ? "加载中…" : "刷新报告")}</button>
        </form> : batches.length ? <label className="keyword-batch-select">{t("选择导入报告（最近 30 份）")}<select className="squircle input" disabled={loading} value={batch?.id || ""} onChange={async event => {
          const id = ++request.current; setLoading(true); setError("")
          try {const next = await keywordImportFn({data: {domain, id: Number(event.target.value)}}); if (id === request.current) setBatch(next)}
          catch (err) {if (id === request.current) setError(err instanceof Error ? err.message : t("加载失败，请重试"))}
          finally {if (id === request.current) setLoading(false)}
        }}>{batches.map(item => <option key={item.id} value={item.id}>{`${item.provider === "google" ? "Google" : "Bing"} · ${item.from} – ${item.to} · #${item.id} · ${item.rowCount} ${t("条")}`}</option>)}</select></label> : null}
        <div className="flex items-center gap-2"><p className="keyword-report-label">{label}</p><HelpHint>{t(source === "google" ? "太平洋时间，所选资源的搜索表现；最多前 50 个词。数据可能延迟，低频查询可能被隐藏。" : source === "bing" ? "Bing 返回所选资源的可用数据，按周更新，无法按日期筛选；记录日期不等于完整覆盖范围。" : "每份 CSV 独立展示，日期来自导入时的填写。缺失指标显示 —，不当作 0。")}</HelpHint></div>
        {source !== "import" && pack?.report?.resource ? <p className="keyword-note">{t("所选资源")}：{pack.report.resource}</p> : null}
        {error ? <p className="keyword-error" role="alert">{t(error)}</p> : null}
        {loading ? <p className="keyword-empty" role="status">{t("加载中…")}</p> : error ? null : rows.length ? <KeywordTable key={source === "import" ? batch?.id : `${source}:${range.from}:${range.to}`} rows={rows}/> : <div className="keyword-empty"><p>{source === "import" ? t("还没有导入报告，可在下方上传搜索平台导出的 CSV。") : liveMessage}</p>{canManage && source !== "import" ? <Link to="/sites/$domain/settings" params={{domain}} search={{tab: "integrations"}} className="squircle btn btn-primary">{t("连接搜索平台")}</Link> : null}</div>}
      </section>
      {canManage ? <KeywordImportPanel domain={domain} onImported={imported}/> : null}
      {canManage && data.config ? <KeywordSeoPanel domain={domain} config={data.config} history={data.history} warning={data.aiWarning} sourceLabel={label} canGenerate={!loading && !error && rows.length > 0} onGenerate={expectedConfig => source === "import" && batch
        ? generateKeywordSeoFn({data: {domain, source: "import", id: batch.id, expectedConfig}})
        : generateKeywordSeoFn({data: {domain, source: "live", provider: source === "bing" ? "bing" : "google", from: range.from, to: range.to, expectedConfig}})}/> : null}
    </div>
  </Shell>
}
