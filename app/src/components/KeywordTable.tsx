import { useMemo, useState } from "react"
import type { KeywordImportRow } from "~/lib/keyword-import"
import { useT } from "~/lib/i18n"

export function KeywordTable({rows, preview = false}: {rows: KeywordImportRow[]; preview?: boolean}) {
  const {t, locale} = useT()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => rows.filter(row => row.query.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [rows, query])
  const size = preview ? 5 : 25
  const lastPage = Math.max(0, Math.ceil(filtered.length / size) - 1)
  const currentPage = Math.min(page, lastPage)
  const shown = filtered.slice(currentPage * size, (currentPage + 1) * size)
  const number = (value: number | null, digits = 0) => value === null ? "—" : value.toLocaleString(locale, {maximumFractionDigits: digits})
  return <div className="keyword-table">
    {!preview ? <label className="keyword-search"><span className="sr-only">{t("搜索关键词")}</span><input className="squircle input" type="search" placeholder={t("搜索关键词")} value={query} onChange={event => {setQuery(event.target.value); setPage(0)}}/></label> : null}
    <div className="keyword-table-head" aria-hidden="true"><span>{t("关键词")}</span><div><span>{t("点击")}</span><span>{t("展现量")}</span><span>{t("点击率")}</span><span>{t("平均排名")}</span></div></div>
    <ul className="keyword-rows">
      {shown.map(row => <li key={row.query}><strong>{row.query}</strong><dl>
        <div><dt>{t("点击")}</dt><dd>{number(row.clicks)}</dd></div>
        <div><dt>{t("展现量")}</dt><dd>{number(row.impressions)}</dd></div>
        <div><dt>{t("点击率")}</dt><dd>{row.ctr === null ? "—" : `${number(row.ctr * 100, 2)}%`}</dd></div>
        <div><dt>{t("平均排名")}</dt><dd>{number(row.position, 1)}</dd></div>
      </dl></li>)}
    </ul>
    {!shown.length ? <p className="keyword-empty">{t("没有匹配的关键词")}</p> : null}
    <div className="keyword-pagination"><span>{t(preview ? "预览前 {0} 条，共 {1} 条" : "显示 {0}–{1}，共 {2} 条", preview ? {0: shown.length, 1: rows.length} : {0: filtered.length ? currentPage * size + 1 : 0, 1: currentPage * size + shown.length, 2: filtered.length})}</span>
      {!preview && lastPage > 0 ? <div><button type="button" className="squircle btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("上一页")}</button><button type="button" className="squircle btn" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t("下一页")}</button></div> : null}
    </div>
  </div>
}
