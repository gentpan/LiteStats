"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MonitorStatusBadge } from "@/components/dashboard/monitor-status-badge";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { ServerMetricsCharts } from "@/components/dashboard/server-metrics-chart";
import type { TimeRange } from "@/components/dashboard/range-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentInstallCommand } from "@/lib/agent-install";

type ServerDetailResponse = {
  server: { id: string; name: string; hostname: string; agentToken: string };
  online: boolean;
  metrics: Array<{
    reportedAt: string;
    cpuPercent: number | null;
    memUsed: number | null;
    memTotal: number | null;
    diskUsed: number | null;
    diskTotal: number | null;
    load1: number | null;
    uptimeSec: number | null;
  }>;
  latest: {
    cpuPercent: number | null;
    memUsed: number | null;
    memTotal: number | null;
    diskUsed: number | null;
    diskTotal: number | null;
    load1: number | null;
    uptimeSec: number | null;
    reportedAt: string;
  } | null;
};

function formatBytes(bytes: number | null) {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function formatUptime(seconds: number | null) {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}天 ${hours}小时`;
}

export function ServerDetailPanel({ serverId }: { serverId: string }) {
  const [range, setRange] = useState<TimeRange>("24h");
  const [data, setData] = useState<ServerDetailResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/servers/${serverId}?range=${range}`);
      if (response.ok && !cancelled) {
        setData(await response.json());
      }
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [serverId, range]);

  if (!data) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  const latest = data.latest;
  const memPercent =
    latest?.memUsed != null && latest.memTotal != null && latest.memTotal > 0
      ? Math.round((latest.memUsed / latest.memTotal) * 100)
      : null;
  const diskPercent =
    latest?.diskUsed != null && latest.diskTotal != null && latest.diskTotal > 0
      ? Math.round((latest.diskUsed / latest.diskTotal) * 100)
      : null;

  return (
    <div className="space-y-8">
      <Link href="/dashboard/servers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        返回服务器列表
      </Link>

      <PageHeader
        eyebrow="Server Monitor"
        title={data.server.name}
        description={data.server.hostname}
        actions={<MonitorStatusBadge status={data.online ? "up" : "down"} />}
      />

      <RangeTabs value={range} onChange={setRange} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="CPU" value={latest?.cpuPercent != null ? `${latest.cpuPercent.toFixed(1)}%` : "—"} />
        <MetricCard label="内存" value={memPercent != null ? `${memPercent}%` : "—"} hint={formatBytes(latest?.memUsed ?? null)} />
        <MetricCard label="磁盘" value={diskPercent != null ? `${diskPercent}%` : "—"} hint={formatBytes(latest?.diskUsed ?? null)} />
        <MetricCard label="运行时间" value={formatUptime(latest?.uptimeSec ?? null)} hint={latest?.load1 != null ? `负载 ${latest.load1.toFixed(2)}` : undefined} />
      </div>

      <ServerMetricsCharts metrics={data.metrics} />

      <Card>
        <CardHeader><CardTitle>一键安装 Agent</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
            {getAgentInstallCommand(
              typeof window !== "undefined" ? window.location.origin : "https://litestats.dev",
              data.server.agentToken,
            )}
          </pre>
          <p className="text-xs text-muted-foreground">
            在目标 Linux 服务器以 root/sudo 执行。使用 /etc/cron.d/litestats-agent，不会覆盖现有 crontab。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
