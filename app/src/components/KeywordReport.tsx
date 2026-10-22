import { UIIcon } from "./UIIcon"
import type { SearchTerms } from "~/lib/keywords"
import { useT } from "~/lib/i18n"
import { List, type ListRow, type ListColumn } from "./ui"

type KeywordView = {
  rows: ListRow[]
  columns?: ListColumn[]
  description: string
  message?: string
  action?: "configure" | "period"
}

/** Keep provider clicks separate from visitors identified by the local tracker. */
export function keywordView(terms: SearchTerms | undefined, tab: string): KeywordView | null {
  if (tab === "organic_kw") {
    const rows = terms?.organic || []
    return {
      rows,
      description: "仅显示来源链接实际提供的搜索词。多数搜索引擎不会传递关键词，无法还原每位访客搜索了什么。",
      ...(!rows.length ? {
        message: "当前范围没有可识别的搜索词。可连接 Google 或 Bing，查看搜索平台提供的汇总关键词。",
        action: "configure" as const,
      } : {}),
    }
  }
  if (tab !== "google_kw" && tab !== "bing_kw") return null
  const google = tab === "google_kw"
  const pack = google ? terms?.google : terms?.bing
  const view: KeywordView = {
    rows: pack?.rows || [],
    columns: [{key: "clicks", label: "点击"}],
    description: google
      ? "Google 所选资源的搜索点击量，按所选日期与太平洋时间汇总，不跟随访客筛选。最多显示前 50 个词，部分低频词不公开。"
      : "Bing 所选资源的搜索点击量，显示接口可用数据，按周更新，不跟随上方日期或访客筛选。最多显示前 50 个词。",
  }
  // A failed request is not evidence that the integration is disconnected.
  if (pack?.error) {
    switch (pack.error) {
      case "period_unsupported":
        return {...view, message: "搜索平台按日汇总，暂不支持实时或滚动 24 小时。请选择近 7 天、近 28 天或自定义日期。", action: "period"}
      case "property_required":
        return {...view, message: "Google 已授权，请先在站点集成中选择并保存 Search Console 资源。", action: "configure"}
      case "auth_error":
        return {...view, message: "搜索平台授权已失效或没有该站点的访问权限，请检查集成配置。", action: "configure"}
      case "request_timeout":
        return {...view, message: "搜索平台响应超时，请稍后刷新重试。其他访问统计仍可正常查看。"}
      default:
        return {...view, message: "暂时无法读取搜索词，请稍后刷新重试；若持续失败，请检查集成配置。", action: "configure"}
    }
  }
  if (!pack?.configured) {
    return {...view, message: google
      ? "还没连接 Google Search Console，所以看不到谷歌搜索词。"
      : "还没连接 Bing Webmaster，所以看不到必应搜索词。", action: "configure"}
  }
  if (!view.rows.length) {
    return {...view, message: "搜索平台暂未返回关键词。新站或最近几天可能尚无数据，低频词也可能被隐藏。"}
  }
  return view
}

export function KeywordReport({view, domain, canManage, onPeriod}: {
  view: KeywordView
  domain: string
  canManage: boolean
  onPeriod: () => void
}) {
  const {t} = useT()
  return <>
    <p className="mb-2 text-xs leading-relaxed text-gray-500 [overflow-wrap:anywhere]">{t(view.description)}</p>
    {view.message ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-3 text-center text-sm text-gray-500">
      <p role="status">{t(view.message)}</p>
      {view.action === "configure" && canManage ? <a className="analytics-config-link" href={`/sites/${encodeURIComponent(domain)}/settings?tab=integrations`}>{t("配置搜索词")} <UIIcon name="external" className="size-3.5"/></a> : null}
      {view.action === "period" ? <button type="button" className="squircle btn btn-secondary" onClick={onPeriod}>{t("查看近 28 天")}</button> : null}
    </div> : <List plain kind="keyword" rows={view.rows} columns={view.columns} />}
  </>
}
