"use client";

import { useEffect, useState } from "react";
import { Eye, MousePointerClick, Radio, Users } from "lucide-react";
import type { StatsRange } from "@/lib/analytics";
import { BreakdownPanel } from "@/components/dashboard/breakdown-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { Skeleton } from "@/components/ui/skeleton";

type StatsResponse = {
  website: {
    id: string;
    name: string;
    domain: string;
    trackingId: string;
  };
  stats: {
    range: StatsRange;
    pageviews: number;
    uniqueVisitors: number;
    liveVisitors: number;
    customEvents: number;
    pagesPerVisit: number;
    bounceRate: number;
    timeseries: Array<{ time: string; pageviews: number; visitors: number }>;
    topPages: Array<{ name: string; count: number }>;
    topReferrers: Array<{ name: string; count: number }>;
    topEvents: Array<{ name: string; count: number }>;
    browsers: Array<{ name: string; count: number }>;
    os: Array<{ name: string; count: number }>;
    devices: Array<{ name: string; count: number }>;
    countries: Array<{ name: string; count: number; code: string }>;
  };
};

export function WebsiteStatsPanel({ websiteId }: { websiteId: string }) {
  const [range, setRange] = useState<StatsRange>("7d");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/stats/${websiteId}?range=${range}`);
      if (!response.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      const json = (await response.json()) as StatsResponse;
      if (!cancelled) {
        setData(json);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [websiteId, range]);

  if (loading && !data) {
    return <WebsiteStatsSkeleton />;
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        无法加载统计数据，请稍后重试
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <RangeTabs value={range} onChange={setRange} />
        <p className="text-xs text-muted-foreground">数据每 30 秒自动刷新会话状态</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="页面浏览量" value={stats.pageviews} icon={Eye} />
        <MetricCard label="独立访客" value={stats.uniqueVisitors} icon={Users} />
        <MetricCard
          label="当前在线"
          value={stats.liveVisitors}
          hint="过去 5 分钟活跃"
          accent="live"
        />
        <MetricCard
          label="每次访问页数"
          value={stats.pagesPerVisit}
          hint={`跳出率 ${stats.bounceRate}%`}
          icon={MousePointerClick}
        />
      </div>

      <TrafficChart range={range} data={stats.timeseries} />

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownPanel title="热门页面" rows={stats.topPages} emptyText="暂无页面数据" total={stats.pageviews} />
        <BreakdownPanel title="流量来源" rows={stats.topReferrers} emptyText="暂无来源数据" total={stats.pageviews} />
      </div>

      <BreakdownPanel
        title="国家 / 地区"
        rows={stats.countries}
        emptyText="暂无地理位置数据"
        total={stats.pageviews}
        showFlags
        icon={<i className="fa-solid fa-earth-americas text-emerald-600" aria-hidden />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BreakdownPanel title="浏览器" rows={stats.browsers} emptyText="暂无数据" total={stats.pageviews} />
        <BreakdownPanel title="操作系统" rows={stats.os} emptyText="暂无数据" total={stats.pageviews} />
        <BreakdownPanel title="设备类型" rows={stats.devices} emptyText="暂无数据" total={stats.pageviews} />
        <BreakdownPanel
          title="自定义事件"
          rows={stats.topEvents}
          emptyText="暂无自定义事件"
          total={stats.customEvents || 1}
        />
      </div>

      {stats.liveVisitors > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Radio className="h-4 w-4" />
          当前有 {stats.liveVisitors} 位访客正在浏览你的网站
        </div>
      ) : null}
    </div>
  );
}

function WebsiteStatsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-[380px]" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
