import { useState } from "react"
import { saveSeoAiSettingsFn, removeSeoAiSettingsFn } from "~/lib/seo-ai-actions"
import type { SeoAiExpectedConfig, SeoAiGeneration, SeoAiPublicConfig, SeoAiReport } from "~/lib/seo-ai"
import { useT } from "~/lib/i18n"
import { formatTimestamp } from "~/lib/format"
import { HelpHint } from "./HelpHint"

export function KeywordSeoPanel({domain, config, history, sourceLabel, canGenerate, onGenerate, warning}: {
  domain: string; config: SeoAiPublicConfig; history: SeoAiReport[]; sourceLabel: string;
  canGenerate: boolean; onGenerate: (expectedConfig: SeoAiExpectedConfig) => Promise<SeoAiGeneration>
  warning?: string
}) {
  const {t, locale} = useT()
  const [settings, setSettings] = useState(config)
  const [endpoint, setEndpoint] = useState(config.endpoint)
  const [model, setModel] = useState(config.model)
  const [apiKey, setApiKey] = useState("")
  const [tokenParameter, setTokenParameter] = useState(config.tokenParameter)
  const [reports, setReports] = useState(history)
  const [activeId, setActiveId] = useState(history[0]?.id)
  const [busy, setBusy] = useState<"save" | "generate" | "remove" | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const changed = endpoint.trim() !== settings.endpoint || model.trim() !== settings.model || tokenParameter !== settings.tokenParameter || !!apiKey.trim()
  const report = reports.find(item => item.id === activeId)
  const dateLabel = (item: SeoAiReport) => `${item.provider === "google" ? "Google" : "Bing"} · ${item.from ? `${item.from} – ${item.to}` : t("接口可用范围")} · ${formatTimestamp(item.createdAt, locale)}`
  async function perform(kind: typeof busy, fn: () => Promise<void>) {
    if (busy) return
    setBusy(kind); setError(""); setNotice("")
    try {await fn()} catch (err) {setError(err instanceof Error ? err.message : t("操作失败，请重试"))}
    finally {setBusy(null)}
  }
  return <section className="squircle keyword-card keyword-seo" aria-labelledby="seo-title">
    <div className="keyword-card-title"><div className="flex items-center gap-2"><h2 id="seo-title">{t("AI SEO 建议")}</h2><HelpHint>{t("根据真实关键词寻找改进方向，建议需人工核实。不会自动修改网站，也不会还原隐藏的搜索词。")}</HelpHint></div></div>
    {warning ? <p className="keyword-error" role="alert">{t(warning)}</p> : null}
    <details className="keyword-ai-settings" open={!settings.hasKey || undefined}><summary>{t("模型服务设置")}{settings.hasKey ? ` · ${t("已配置")}` : ""}</summary>
      <p className="keyword-note">{t("填写兼容 Chat Completions 的服务。密钥加密保存，仅站点管理员可管理；服务商可能按调用计费。")}</p>
      <form onSubmit={event => {event.preventDefault(); void perform("save", async () => {
        const result = await saveSeoAiSettingsFn({data: {domain, endpoint, model, apiKey, tokenParameter}})
        setSettings(result); setEndpoint(result.endpoint); setModel(result.model); setTokenParameter(result.tokenParameter); setApiKey(""); setNotice(t("模型设置已保存"))
      })}}><fieldset disabled={!!busy}>
        <div className="keyword-form-grid keyword-ai-fields">
          <label>{t("完整接口地址")}<input className="squircle input" type="url" required maxLength={2048} value={endpoint} onChange={event => {setEndpoint(event.target.value); setNotice("")}} placeholder="https://api.example.com/v1/chat/completions" autoComplete="off" autoCapitalize="none" spellCheck={false}/></label>
          <label>{t("模型名称")}<input className="squircle input" required maxLength={200} value={model} onChange={event => {setModel(event.target.value); setNotice("")}} placeholder={t("服务商提供的模型名称")} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label>
          <label>API Key<input className="squircle input" type="password" value={apiKey} maxLength={4096} required={!settings.hasKey || endpoint.trim() !== settings.endpoint} onChange={event => {setApiKey(event.target.value); setNotice("")}} autoComplete="new-password" autoCapitalize="none" spellCheck={false} placeholder={settings.hasKey ? t("留空保留已保存的密钥") : t("填写 API Key")}/></label>
        </div>
        <details className="keyword-ai-advanced"><summary>{t("兼容选项")}</summary><label>{t("输出长度参数")}<select className="squircle input" value={tokenParameter} onChange={event => {setTokenParameter(event.target.value as typeof tokenParameter); setNotice("")}}><option value="max_completion_tokens">max_completion_tokens</option><option value="max_tokens">max_tokens</option></select><span className="keyword-note">{t("默认选第一项；服务商要求旧版参数时再切换。")}</span></label></details>
        <div className="keyword-actions"><button className="squircle btn" type="submit" disabled={!!busy}>{t(busy === "save" ? "保存中…" : "保存设置")}</button>
          {settings.hasKey ? <button className="squircle btn" type="button" disabled={!!busy} onClick={() => void perform("remove", async () => {await removeSeoAiSettingsFn({data: {domain}}); setSettings({...settings, hasKey: false}); setApiKey(""); setNotice(t("密钥和模型配置已移除，历史建议仍保留。"))})}>{t("移除配置")}</button> : null}
        </div>
      </fieldset></form>
    </details>
    <div className="keyword-ai-generate"><div><strong>{t("分析当前报告")}</strong><p className="keyword-note">{sourceLabel}</p><p className="keyword-note">{t("点击生成后，将站点域名和当前报告中展现量最高的最多 50 个关键词及指标发送给你配置的模型服务。不发送访客记录。")}</p></div>
      <button className="squircle btn btn-primary" type="button" disabled={!!busy || !canGenerate || !settings.hasKey || changed} onClick={() => void perform("generate", async () => {
        const result = await onGenerate({endpoint: settings.endpoint, model: settings.model, tokenParameter: settings.tokenParameter})
        if (!result.ok) {setError(t(result.message)); return}
        setReports(items => [result.report, ...items].slice(0, 10)); setActiveId(result.report.id); setNotice(t("建议已生成，请结合实际页面核实。"))
      })}>{t(busy === "generate" ? "生成中…" : "生成建议")}</button>
    </div>
    {settings.hasKey ? <p className="keyword-note">{t("已保存的服务")}：{settings.endpoint} · {settings.model}</p> : null}
    {changed && settings.hasKey ? <p className="keyword-note" role="status">{t("模型设置有未保存的修改，请先保存再生成建议。")}</p> : null}
    {!canGenerate ? <p className="keyword-note">{t("先选择一份有数据的报告，再生成建议。")}</p> : null}
    {error ? <p className="keyword-error" role="alert">{t(error)}</p> : null}
    {notice ? <p className="keyword-note" role="status">{notice}</p> : null}
    {reports.length ? <div className="keyword-ai-results">
      <label>{t("最近的建议")}<select className="squircle input" value={activeId} onChange={event => setActiveId(Number(event.target.value))}>{reports.map(item => <option key={item.id} value={item.id}>{dateLabel(item)}</option>)}</select></label>
      {report ? <><p className="keyword-note">{t(report.scopeLabel)} · {report.model}</p><p className="keyword-ai-summary">{report.summary}</p><ol>{report.suggestions.map((item, index) => <li key={index}><div><h3>{item.keyword}</h3><span className="squircle keyword-priority">{t({high: "优先处理", medium: "值得尝试", low: "持续观察"}[item.priority])}</span></div><p><strong>{t("依据")}</strong>{item.reason}</p><p><strong>{t("建议行动")}</strong>{item.action}</p></li>)}</ol></> : null}
    </div> : null}
  </section>
}
