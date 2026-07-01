"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Globe2, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { CreateWebsiteCard } from "@/components/dashboard/create-website-card";
import { SiteFavicon } from "@/components/dashboard/site-favicon";
import { DeleteWebsiteButton } from "@/components/dashboard/delete-website-button";
import { MonitorStatusBadge, SslStatusBadge } from "@/components/dashboard/monitor-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import type { SslHealth } from "@/lib/monitor-check";

export type SiteRow = {
  id: string;
  name: string;
  domain: string;
  trackingId: string;
  pageviews: number;
  uniqueVisitors: number;
  monitorEnabled: boolean;
  monitorUrl: string;
  status: "up" | "down" | "unknown";
  responseMs: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  sslHealth: SslHealth;
  sslDaysLeft: number | null;
};

type MonitorOverviewResponse = {
  totals: {
    total: number;
    monitored: number;
    up: number;
    down: number;
    sslWarning: number;
    avgUptime24h: number | null;
  };
  monitors: Array<{
    websiteId: string;
    name: string;
    domain: string;
    trackingId?: string;
    monitorEnabled: boolean;
    monitorUrl: string;
    status: "up" | "down" | "unknown";
    responseMs: number | null;
    uptime24h: number | null;
    uptime7d: number | null;
    sslHealth: SslHealth;
    sslDaysLeft: number | null;
    pageviews?: number;
    uniqueVisitors?: number;
  }>;
};

type SitesPanelProps = {
  initialSites: SiteRow[];
  initialTotals: MonitorOverviewResponse["totals"];
};

function mergeSites(
  monitors: MonitorOverviewResponse["monitors"],
  statsMap: Map<string, { pageviews: number; uniqueVisitors: number; trackingId: string }>,
): SiteRow[] {
  return monitors.map((monitor) => {
    const stats = statsMap.get(monitor.websiteId);
    return {
      id: monitor.websiteId,
      name: monitor.name,
      domain: monitor.domain,
      trackingId: stats?.trackingId ?? monitor.trackingId ?? "",
      pageviews: stats?.pageviews ?? monitor.pageviews ?? 0,
      uniqueVisitors: stats?.uniqueVisitors ?? monitor.uniqueVisitors ?? 0,
      monitorEnabled: monitor.monitorEnabled,
      monitorUrl: monitor.monitorUrl,
      status: monitor.status,
      responseMs: monitor.responseMs,
      uptime24h: monitor.uptime24h,
      uptime7d: monitor.uptime7d,
      sslHealth: monitor.sslHealth,
      sslDaysLeft: monitor.sslDaysLeft,
    };
  });
}

export function SitesPanel({ initialSites, initialTotals }: SitesPanelProps) {
  const router = useRouter();
  const [sites, setSites] = useState(initialSites);
  const [totals, setTotals] = useState(initialTotals);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/monitors");
    if (!response.ok) return;

    const data = (await response.json()) as MonitorOverviewResponse;
    setTotals(data.totals);
    setSites((prev) => {
      const statsMap = new Map(
        prev.map((site) => [
          site.id,
          { pageviews: site.pageviews, uniqueVisitors: site.uniqueVisitors, trackingId: site.trackingId },
        ]),
      );
      return mergeSites(data.monitors, statsMap);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleRefresh(websiteId: string) {
    setRefreshingId(websiteId);
    await fetch(`/api/monitors/${websiteId}/check`, { method: "POST" });
    await load();
    setRefreshingId(null);
  }

  function onWebsiteCreated() {
    router.refresh();
    load();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Sites"
        title="站点"
        description="统一管理追踪统计、Uptime 与 SSL 监控。添加站点后自动启用监控，每 60 秒后台检测。"
        actions={
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            刷新监控
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="站点总数" value={totals.total} icon={Globe2} />
        <MetricCard label="当前在线" value={totals.up} hint={`${totals.down} 个离线`} accent="live" />
        <MetricCard
          label="24h 平均可用率"
          value={totals.avgUptime24h != null ? `${totals.avgUptime24h}%` : "—"}
          icon={ShieldCheck}
        />
        <MetricCard label="SSL 告警" value={totals.sslWarning} hint="30 天内过期或无效" icon={AlertTriangle} />
      </div>

      <CreateWebsiteCard onCreated={onWebsiteCreated} />

      {sites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Globe2 className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">还没有站点</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              创建第一个站点后，即可获取追踪代码、访问统计，并自动启用 Uptime / SSL 监控
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">站点</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">响应</th>
                  <th className="px-5 py-3 font-medium">24h</th>
                  <th className="px-5 py-3 font-medium">7d</th>
                  <th className="px-5 py-3 font-medium">SSL</th>
                  <th className="px-5 py-3 font-medium">7日 PV</th>
                  <th className="px-5 py-3 font-medium">7日 UV</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id} className="border-b border-border/80 last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <SiteFavicon domain={site.domain} name={site.name} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium">{site.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {site.monitorEnabled ? (
                        <MonitorStatusBadge status={site.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">已暂停</span>
                      )}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-muted-foreground">
                      {site.responseMs != null ? `${site.responseMs} ms` : "—"}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {site.uptime24h != null ? `${site.uptime24h}%` : "—"}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {site.uptime7d != null ? `${site.uptime7d}%` : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <SslStatusBadge health={site.sslHealth} daysLeft={site.sslDaysLeft} />
                    </td>
                    <td className="px-5 py-4 tabular-nums">{formatNumber(site.pageviews)}</td>
                    <td className="px-5 py-4 tabular-nums">{formatNumber(site.uniqueVisitors)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={refreshingId === site.id || !site.monitorEnabled}
                          onClick={() => handleRefresh(site.id)}
                          title="立即检测"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingId === site.id ? "animate-spin" : ""}`} />
                        </Button>
                        <DeleteWebsiteButton websiteId={site.id} websiteName={site.name} />
                        <Link
                          href={`/dashboard/websites/${site.id}/monitor`}
                          className="px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          监控
                        </Link>
                        <Link
                          href={`/dashboard/${site.id}`}
                          className="inline-flex items-center gap-1 px-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          统计
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            共 {formatNumber(sites.length)} 个站点 · 监控每 60 秒自动刷新
          </div>
        </Card>
      )}
    </div>
  );
}
