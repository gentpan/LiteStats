import { HelpHint } from "./HelpHint"
import { List, ReportCard, ReportMenu, type DetailsSpec, type ListRow } from "./ui"
import { useT } from "~/lib/i18n"

type PageReportData = {
  pages: ListRow[]
  entryPages: ListRow[]
  exitPages: ListRow[]
  hostnames: ListRow[]
  titles?: ListRow[]
  queries?: ListRow[]
  notFoundPages?: ListRow[]
  eventSummary?: {
    total: number
    downloadsTotal: number
    outboundTotal: number
    events: ListRow[]
    properties: ListRow[]
    downloads: ListRow[]
    outbound: ListRow[]
  }
}

/** One view spec keeps the card and its searchable detail sheet in agreement. */
export function pageReportView(data: PageReportData, tab: string, mode: string, eventMode: string, domain: string): DetailsSpec {
  if (tab === "404") return {
    title: "404 页面", kind: "notfound", rows: data.notFoundPages || [], valueLabel: "次数", showPercent: false,
    description: "按页面标题识别或显式上报的 404 事件，不代表服务端状态检查。",
    emptyMessage: "此时段未收到 404 页面事件",
  }
  if (tab === "events") {
    const summary = data.eventSummary
    const common = {valueLabel: "次数", emptyMessage: "此时段未收到事件，安装埋点后可记录点击和下载。"}
    if (eventMode === "properties") return {
      ...common, title: "事件属性", kind: "property", rows: summary?.properties || [], showPercent: false,
      description: "按事件、属性和值统计次数；同一事件可以包含多个属性。",
      emptyMessage: "此时段没有已记录的事件属性",
    }
    if (eventMode === "downloads") return {
      ...common, title: "文件下载", kind: "download", rows: linkRows(summary?.downloads || []), percentageTotal: summary?.downloadsTotal || 0,
      description: "文件下载点击次数；占比按此时段全部下载事件计算。",
      emptyMessage: "此时段未收到文件下载事件",
    }
    if (eventMode === "outbound") return {
      ...common, title: "外链点击", kind: "outbound", rows: linkRows(summary?.outbound || []), percentageTotal: summary?.outboundTotal || 0,
      description: "外部链接点击次数；占比按此时段全部外链点击计算。",
      emptyMessage: "此时段未收到外链点击事件",
    }
    return {
      ...common, title: "事件汇总", kind: "event", rows: summary?.events || [], percentageTotal: summary?.total || 0,
      description: "事件触发次数及占全部事件的比例，不包含页面浏览与 404。",
    }
  }
  if (mode === "hostname") return {title: "主机名", kind: "hostname", rows: data.hostnames}
  if (tab === "title") return {title: "标题", kind: "title", rows: data.titles || []}
  if (tab === "query") return {title: "查询", kind: "query", rows: data.queries || []}
  const rows = tab === "entry" ? data.entryPages : tab === "exit" ? data.exitPages : data.pages
  return {
    title: tab === "entry" ? "进入页" : tab === "exit" ? "退出页" : "热门页面", kind: "page",
    rows: rows.map(row => ({...row, href: safeWebLink(row.name.startsWith("http") ? row.name : `https://${domain}${row.name.startsWith("/") ? "" : "/"}${row.name}`)})),
  }
}

function safeWebLink(value: string): string | undefined {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

function linkRows(rows: ListRow[]): ListRow[] {
  return rows.map(row => ({...row, href: safeWebLink(row.name)}))
}

export function PageReport({data, domain, active, onChange, mode, onMode, eventMode, onEventMode, onPick}: {
  data: PageReportData
  domain: string
  active: string
  onChange: (tab: string) => void
  mode: string
  onMode: (mode: string) => void
  eventMode: string
  onEventMode: (mode: string) => void
  onPick: (name: string) => void
}) {
  const { t } = useT()
  const spec = pageReportView(data, active, mode, eventMode, domain)
  const pick = mode === "path" && active === "pages" ? onPick : undefined
  return <ReportCard className="page-report" autoRevealActive
    tabs={[{id: "pages", label: "热门页面"}, {id: "entry", label: "进入页"}, {id: "exit", label: "退出页"}, {id: "404", label: "404"}, {id: "events", label: "事件"}, {id: "title", label: "标题"}, {id: "query", label: "查询"}]}
    active={active} onChange={onChange}
    extra={<>
      {spec.description ? <HelpHint>{t(spec.description)}</HelpHint> : null}
      {active === "events" ? <ReportMenu value={eventMode} onChange={onEventMode} options={[{id: "count", label: "次数"}, {id: "properties", label: "属性"}, {id: "outbound", label: "外链"}, {id: "downloads", label: "下载"}]} />
        : active === "404" ? null : <ReportMenu value={mode} onChange={onMode} options={[{id: "path", label: "路径"}, {id: "hostname", label: "网址"}]} />}
    </>}
    details={{...spec, onPick: pick}}
  >
    <List plain {...spec} title={undefined} onPick={pick}/>
  </ReportCard>
}
