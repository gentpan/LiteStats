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
  const points = seriesBy?.[metric] || series
  return (
    <div className="relative col-span-full w-full rounded-md bg-white shadow-sm">
      <div className="relative flex flex-wrap">
        <Card index={0} label="独立访客" selected={metric === "visitors"} onSelect={() => onMetric("visitors")} value={overview.visitors} prev={compare.visitors} />
        <Card index={1} label="总会话" selected={metric === "visits"} onSelect={() => onMetric("visits")} value={overview.visits} prev={compare.visits} />
        <Card index={2} label="总浏览量" selected={metric === "pageviews"} onSelect={() => onMetric("pageviews")} value={overview.pageviews} prev={compare.pageviews} />
        <Card index={3} label="每次访问浏览量" selected={metric === "views_per_visit"} onSelect={() => onMetric("views_per_visit")} value={overview.views_per_visit} prev={compare.views_per_visit} text={overview.views_per_visit.toFixed(2)} />
        <Card index={4} label="跳出率" selected={metric === "bounce_rate"} onSelect={() => onMetric("bounce_rate")} suffix="%" value={overview.bounce_rate} prev={compare.bounce_rate} invertChange />
        <Card index={5} label="访问时长" selected={metric === "visit_duration"} onSelect={() => onMetric("visit_duration")} value={overview.visit_duration} prev={compare.visit_duration} text={formatDuration(overview.visit_duration)} />
      </div>
      <div className="relative flex flex-col pr-4 pl-3">
        <TrendChart points={points} metric={metric} interval={interval} realtime={realtime} onZoom={onZoom} />
      </div>
    </div>
  )
}
