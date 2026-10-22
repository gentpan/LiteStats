import { Surface } from "~/components/Surface"
import { useT } from "~/lib/i18n"
import { TrendChart } from "~/components/TrendChart"
import { Card, formatDuration } from "~/components/ui"
import type { MetricKey, Overview, SeriesBy } from "~/lib/ch"
import type { Point } from "~/lib/ch"
import type { Interval } from "~/lib/range"

export function VisitorGraph({
  overview,
  compare,
  series,
  seriesBy,
  metric,
  onMetric,
  interval = "day",
  realtime = false,
  onZoom,
}: {
  overview: Overview
  compare: Partial<Overview>
  series: Point[]
  seriesBy?: SeriesBy
  metric: MetricKey
  onMetric: (m: MetricKey) => void
  interval?: Interval
  realtime?: boolean
  onZoom?: (date: string) => void
}) {
  const { t } = useT()
  const points = seriesBy?.[metric] || series
  return (
    <Surface className="visitor-graph analytics-panel col-span-full">
      <div className="metric-grid">
        <Card icon="user" index={0} label={t("独立访客")} selected={metric === "visitors"} onSelect={() => onMetric("visitors")} value={overview.visitors} prev={compare.visitors} />
        <Card icon="activity" index={1} label={t("总会话")} selected={metric === "visits"} onSelect={() => onMetric("visits")} value={overview.visits} prev={compare.visits} />
        <Card icon="eye" index={2} label={t("总浏览量")} selected={metric === "pageviews"} onSelect={() => onMetric("pageviews")} value={overview.pageviews} prev={compare.pageviews} />
        <Card icon="copy" index={3} label={t("每次访问浏览量")} selected={metric === "views_per_visit"} onSelect={() => onMetric("views_per_visit")} value={overview.views_per_visit} prev={compare.views_per_visit} text={overview.views_per_visit.toFixed(2)} />
        <Card icon="external" index={4} label={t("跳出率")} selected={metric === "bounce_rate"} onSelect={() => onMetric("bounce_rate")} suffix="%" value={overview.bounce_rate} prev={compare.bounce_rate} invertChange />
        <Card icon="clock" index={5} label={t("访问时长")} selected={metric === "visit_duration"} onSelect={() => onMetric("visit_duration")} value={overview.visit_duration} prev={compare.visit_duration} text={formatDuration(overview.visit_duration)} />
      </div>
      <div className="trend-section">
        <div className="analytics-heading"><h3>{t("访问趋势")}</h3><span>{t("点击上方指标切换图表")}</span></div>
        <TrendChart points={points} metric={metric} interval={interval} realtime={realtime} onZoom={onZoom} />
      </div>
    </Surface>
  )
}
