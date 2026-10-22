import { useState } from "react"
import { importKeywordsFn } from "~/lib/keyword-import-actions"
import { KEYWORD_IMPORT_MAX_BYTES, parseKeywordCsv, type KeywordImportBatch, type KeywordImportProvider, type KeywordImportRow } from "~/lib/keyword-import"
import { isDateRange } from "~/lib/date-time"
import { useT } from "~/lib/i18n"
import { KeywordTable } from "./KeywordTable"

export function KeywordImportPanel({domain, onImported}: {domain: string; onImported: (batch: KeywordImportBatch) => void}) {
  const {t} = useT()
  const [provider, setProvider] = useState<KeywordImportProvider>("google")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [csvText, setCsvText] = useState("")
  const [rows, setRows] = useState<KeywordImportRow[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  return <details className="squircle keyword-card keyword-import"><summary>{t("导入关键词 CSV")}</summary>
    <p className="keyword-note">{t("从搜索平台导出按关键词汇总的 UTF-8 CSV，选择报告对应的日期。每次导入独立保留，不覆盖历史，不合并重叠日期。最多 1 MB、5000 条。")}</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return
      setBusy(true); setError(""); setSaved(false)
      try {const batch = await importKeywordsFn({data: {domain, provider, from, to, csvText}}); onImported(batch); setSaved(true)}
      catch (err) {setError(err instanceof Error ? err.message : t("导入失败，请重试"))}
      finally {setBusy(false)}
    }}><fieldset disabled={busy}>
      <div className="keyword-form-grid">
        <label>{t("数据来源")}<select className="squircle input" value={provider} onChange={event => {setProvider(event.target.value as KeywordImportProvider); setSaved(false)}}><option value="google">Google Search Console</option><option value="bing">Bing Webmaster</option></select></label>
        <label>{t("报告开始日期")}<input className="squircle input" type="date" required value={from} onInput={event => {setFrom(event.currentTarget.value); setSaved(false)}}/></label>
        <label>{t("报告结束日期")}<input className="squircle input" type="date" required min={from || undefined} value={to} onInput={event => {setTo(event.currentTarget.value); setSaved(false)}}/></label>
      </div>
      <label className="keyword-file">{t("CSV 文件")}<input type="file" accept=".csv,text/csv" onChange={async event => {
        setError(""); setCsvText(""); setRows([]); setSaved(false)
        const file = event.target.files?.[0]; if (!file) return
        setBusy(true)
        try {
          if (file.size > KEYWORD_IMPORT_MAX_BYTES) throw new Error("CSV 文件不能超过 1 MB")
          const text = await file.text(); const parsed = parseKeywordCsv(text)
          setCsvText(text); setRows(parsed)
        } catch (err) {setError(err instanceof Error ? err.message : t("无法读取 CSV 文件"))}
        finally {setBusy(false)}
      }}/></label>
      {rows.length ? <KeywordTable key={csvText} rows={rows} preview/> : null}
      <button className="squircle btn btn-primary" type="submit" disabled={busy || saved || !rows.length || !isDateRange(from, to)}>{t(busy ? "处理中…" : saved ? "已导入" : "确认导入")}</button>
    </fieldset></form>
    {error ? <p className="keyword-error" role="alert">{t(error)}</p> : null}
    {saved ? <p className="keyword-note" role="status">{t("导入成功，已切换到这份报告。")}</p> : null}
  </details>
}
