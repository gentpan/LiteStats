"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SiteFavicon } from "@/components/dashboard/site-favicon";
import { MonitorStatusBadge, SslStatusBadge } from "@/components/dashboard/monitor-status-badge";
import { MonitorIncidentTimeline, MonitorUptimeChart } from "@/components/dashboard/monitor-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitorRange } from "@/lib/monitor";
import type { TimeRange } from "@/components/dashboard/range-tabs";
import type { SslHealth } from "@/lib/monitor-check";

type MonitorDetailResponse = {
  website: {
    id: string;
    name: string;
    domain: string;
    monitorUrl: string;
    monitorEnabled: boolean;
  };
  range: MonitorRange;
  summary: {
    uptime: number | null;
    avgResponseMs: number | null;
    totalChecks: number;
    status: "up" | "down" | "unknown";
    sslValid: boolean | null;
    sslDaysLeft: number | null;
    sslExpiresAt: string | null;
    sslIssuer: string | null;
    sslHealth: SslHealth;
    lastCheckedAt: string | null;
    error: string | null;
  };
  checks: Array<{
    id: string;
    status: string;
    responseMs: number | null;
    statusCode: number | null;
    sslValid: boolean | null;
    sslDaysLeft: number | null;
    sslExpiresAt: string | null;
    error: string | null;
    checkedAt: string;
  }>;
};

export function MonitorDetailPanel({ websiteId }: { websiteId: string }) {
  const [range, setRange] = useState<TimeRange>("7d");
  const [data, setData] = useState<MonitorDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/monitors/${websiteId}?range=${range}`);
    if (response.ok) {
      setData(await response.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [websiteId, range]);

  async function runCheck() {
    setChecking(true);
    await fetch(`/api/monitors/${websiteId}/check`, { method: "POST" });
    await load();
    setChecking(false);
  }

  async function toggleMonitoring(enabled: boolean) {
    await fetch(`/api/monitors/${websiteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monitorEnabled: enabled }),
    });
    await load();
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">无法加载监控详情</p>;
  }

  const { website, summary } = data;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/dashboard/websites" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回站点列表
        </Link>
      </div>

      <PageHeader
        eyebrow="Site Monitor"
        leading={<SiteFavicon domain={website.domain} name={website.name} size="lg" />}
        title={website.name}
        description={website.monitorUrl}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonitorStatusBadge status={summary.status} />
            <SslStatusBadge health={summary.sslHealth} daysLeft={summary.sslDaysLeft} />
            <Button variant="secondary" size="sm" onClick={runCheck} disabled={checking || !website.monitorEnabled}>
              <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              立即检测
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleMonitoring(!website.monitorEnabled)}
            >
              {website.monitorEnabled ? "暂停监控" : "启用监控"}
            </Button>
          </div>
        }
      />

      <RangeTabs value={range} onChange={setRange} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="可用率" value={summary.uptime != null ? `${summary.uptime}%` : "—"} />
        <MetricCard label="平均响应" value={summary.avgResponseMs != null ? `${summary.avgResponseMs} ms` : "—"} />
        <MetricCard label="检测次数" value={summary.totalChecks} />
        <MetricCard
          label="SSL 到期"
          value={
            summary.sslExpiresAt
              ? new Date(summary.sslExpiresAt).toLocaleDateString("zh-CN")
              : "—"
          }
          hint={summary.sslIssuer ?? undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MonitorUptimeChart checks={data.checks} />
        <MonitorIncidentTimeline checks={data.checks} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SSL 证书信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
          <div>
            <p className="text-muted-foreground">状态</p>
            <p className="mt-1 font-medium">
              <SslStatusBadge health={summary.sslHealth} daysLeft={summary.sslDaysLeft} />
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">颁发者</p>
            <p className="mt-1 font-medium">{summary.sslIssuer ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">剩余天数</p>
            <p className="mt-1 font-medium">{summary.sslDaysLeft != null ? `${summary.sslDaysLeft} 天` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">最近检测</p>
            <p className="mt-1 font-medium">
              {summary.lastCheckedAt ? new Date(summary.lastCheckedAt).toLocaleString("zh-CN") : "—"}
            </p>
          </div>
          {summary.error ? (
            <div className="md:col-span-2 rounded-lg bg-red-50 px-4 py-3 text-red-700">
              {summary.error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
