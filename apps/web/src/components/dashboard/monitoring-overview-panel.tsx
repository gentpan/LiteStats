"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MonitorTable, type MonitorRow } from "@/components/dashboard/monitor-table";

type MonitorOverviewResponse = {
  totals: {
    total: number;
    monitored: number;
    up: number;
    down: number;
    sslWarning: number;
    avgUptime24h: number | null;
  };
  monitors: MonitorRow[];
};

export function MonitoringOverviewPanel() {
  const [data, setData] = useState<MonitorOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/monitors");
    if (response.ok) {
      setData(await response.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleRefresh(websiteId: string) {
    setRefreshingId(websiteId);
    await fetch(`/api/monitors/${websiteId}/check`, { method: "POST" });
    await load();
    setRefreshingId(null);
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">加载监控数据...</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-600">无法加载监控数据</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Monitoring"
        title="站点监控"
        description="对所有已添加站点进行 Uptime 与 SSL 证书监控，默认每 60 秒自动检测。"
        actions={
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="监控站点" value={data.totals.monitored} icon={Activity} />
        <MetricCard
          label="当前在线"
          value={data.totals.up}
          hint={`${data.totals.down} 个离线`}
          accent="live"
        />
        <MetricCard
          label="24h 平均可用率"
          value={data.totals.avgUptime24h != null ? `${data.totals.avgUptime24h}%` : "—"}
          icon={ShieldCheck}
        />
        <MetricCard
          label="SSL 告警"
          value={data.totals.sslWarning}
          hint="30 天内过期或无效"
          icon={AlertTriangle}
        />
      </div>

      <MonitorTable
        monitors={data.monitors}
        onRefresh={handleRefresh}
        refreshingId={refreshingId}
      />
    </div>
  );
}
