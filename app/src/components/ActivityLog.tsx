import { useMemo, useState } from "react"
import { useT } from "~/lib/i18n"
import { CountryFlag } from "./icons"
import { UIIcon } from "./UIIcon"
import { Surface } from "./Surface"
import { ActionButton } from "./ActionButton"
import { countryName } from "~/lib/countries"
import type { RecentEvent } from "~/lib/ch"

function timestamp(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z")
}

export function ActivityLog({rows, timezone, hasMore}: {rows: RecentEvent[]; timezone: string; hasMore: boolean}) {
  const {t, locale} = useT()
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const [page, setPage] = useState(0)
  const types = [{id:"all",label:"全部记录"}, {id:"pageview",label:"页面浏览"}, {id:"session",label:"新会话"}, {id:"custom",label:"自定义事件"}]
  const matchesKind = (row: RecentEvent, value: string) => value === "all" || (value === "custom" ? !["session","pageview"].includes(row.name) : row.name === value)
  const filtered = useMemo(()=>rows.filter(row=>matchesKind(row,kind) && [row.name,row.name === "session" ? t("新会话") : row.name === "pageview" ? t("页面浏览") : t("自定义事件"),row.pathname,row.source,row.source === "Direct" || !row.source ? t("直接访问") : "",countryName(row.country,locale),row.browser,row.os,row.device].join(" ").toLowerCase().includes(query.trim().toLowerCase())),[rows,kind,query,locale,t])
  const lastPage = Math.max(0, Math.ceil(filtered.length/20)-1)
  const currentPage = Math.min(page,lastPage)
  const visible = filtered.slice(currentPage*20,(currentPage+1)*20)
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-CN", {timeZone:timezone,month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"})
  return <Surface className="activity-log-panel">
    <div className="activity-log-tools">
      <div className="activity-type-tabs" role="group" aria-label={t("事件类型")}>
        {types.map(type=><button key={type.id} type="button" aria-pressed={kind===type.id} onClick={()=>{setKind(type.id);setPage(0)}}>{t(type.label)}<span>{rows.filter(row=>matchesKind(row,type.id)).length}</span></button>)}
      </div>
      <label className="activity-search"><UIIcon name="search" /><span className="sr-only">{t("搜索活动记录")}</span><input type="search" className="input" placeholder={t("搜索页面、来源、国家或设备")} value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} /></label>
    </div>
    <div className="activity-log-caption"><span>{t("匹配 {0} 条记录",{0:filtered.length})}</span><span>{t("时间由新到旧")} · {timezone}</span></div>
    <div className="activity-columns" aria-hidden="true"><span>{t("时间")}</span><span>{t("事件与页面")}</span><span>{t("国家/地区")}</span><span>{t("来源与设备")}</span></div>
    {visible.length ? <ol className="activity-records">{visible.map((row,index)=>{
      const date=timestamp(row.time)
      const time=Number.isNaN(date.getTime()) ? row.time : dateFormat.format(date)
      const label=row.name === "session" ? t("新会话") : row.name === "pageview" ? t("页面浏览") : row.name
      return <li key={`${row.time}-${row.name}-${row.pathname}-${index}`}><details className="activity-record">
        <summary>
          <time className="activity-time" dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{time}</time>
          <div className="activity-event"><span className="activity-event-icon"><UIIcon name={row.name === "session" ? "user" : row.name === "pageview" ? "eye" : "code"}/></span><div><strong>{label}</strong><span title={row.pathname}>{row.pathname || "/"}</span></div></div>
          <span className="activity-country">{row.country ? <CountryFlag code={row.country}/> : <UIIcon name="globe"/>}{countryName(row.country,locale)}</span>
          <div className="activity-device"><strong>{row.source === "Direct" || !row.source ? t("直接访问") : row.source}</strong><span>{[row.browser,row.os,row.device].filter(Boolean).join(" · ") || t("未知设备")}</span></div>
          <UIIcon name="arrow" className="activity-expand"/>
        </summary>
        <dl className="activity-record-details">
          {[ [t("事件名称"),row.name], [t("页面路径"),row.pathname || "/"], [t("来源"),row.source === "Direct" || !row.source ? t("直接访问") : row.source], [t("国家/地区"),countryName(row.country,locale)], [t("浏览器"),row.browser], [t("操作系统"),row.os], [t("设备"),row.device], [t("时间"),`${time} (${timezone})`] ].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value || "—"}</dd></div>)}
        </dl>
      </details></li>
    })}</ol> : <div className="activity-empty"><UIIcon name="activity"/><strong>{t(rows.length ? "没有匹配的活动记录" : "所选时间范围内没有活动")}</strong><p>{t(rows.length ? "尝试调整关键词或事件类型。" : "网站收到访问或自定义事件后，将在这里显示。")}</p>{query || kind !== "all" ? <ActionButton onClick={()=>{setQuery("");setKind("all");setPage(0)}}>{t("清除筛选")}</ActionButton> : null}</div>}
    <footer className="activity-pagination"><p>{t(hasMore ? "仅展示所选范围内最新 200 条，搜索与类型筛选作用于这些记录。" : "搜索与类型筛选作用于当前已加载记录。")}</p><div><ActionButton disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>{t("上一页")}</ActionButton><span>{currentPage+1} / {lastPage+1}</span><ActionButton disabled={currentPage>=lastPage} onClick={()=>setPage(currentPage+1)}>{t("下一页")}</ActionButton></div></footer>
  </Surface>
}
