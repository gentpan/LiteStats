"use client";

import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { SiteFavicon } from "@/components/dashboard/site-favicon";
import { MonitorStatusBadge, SslStatusBadge } from "@/components/dashboard/monitor-status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import type { SslHealth } from "@/lib/monitor-check";

export type MonitorRow = {
  websiteId: string;
  name: string;
  domain: string;
  monitorEnabled: boolean;
  monitorUrl: string;
  status: "up" | "down" | "unknown";
  responseMs: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  sslHealth: SslHealth;
  sslDaysLeft: number | null;
  lastCheckedAt: string | null;
};

type MonitorTableProps = {
  monitors: MonitorRow[];
  onRefresh?: (websiteId: string) => Promise<void>;
  refreshingId?: string | null;
};

export function MonitorTable({ monitors, onRefresh, refreshingId }: MonitorTableProps) {
  if (monitors.length === 0) {
    return (
      <Card className="px-6 py-16 text-center">
        <p className="text-base font-semibold">暂无监控站点</p>
        <p className="mt-2 text-sm text-muted-foreground">先在站点管理中添加网站，系统会自动启用 Uptime 与 SSL 监控</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">站点</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">响应</th>
              <th className="px-5 py-3 font-medium">24h 可用率</th>
              <th className="px-5 py-3 font-medium">7d 可用率</th>
              <th className="px-5 py-3 font-medium">SSL</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {monitors.map((monitor) => (
              <tr key={monitor.websiteId} className="border-b border-border/80 last:border-0 hover:bg-muted/30">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <SiteFavicon domain={monitor.domain} name={monitor.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium">{monitor.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{monitor.monitorUrl || monitor.domain}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  {monitor.monitorEnabled ? (
                    <MonitorStatusBadge status={monitor.status} />
                  ) : (
                    <span className="text-xs text-muted-foreground">已暂停</span>
                  )}
                </td>
                <td className="px-5 py-4 tabular-nums text-muted-foreground">
                  {monitor.responseMs != null ? `${monitor.responseMs} ms` : "—"}
                </td>
                <td className="px-5 py-4 tabular-nums">
                  {monitor.uptime24h != null ? `${monitor.uptime24h}%` : "—"}
                </td>
                <td className="px-5 py-4 tabular-nums">
                  {monitor.uptime7d != null ? `${monitor.uptime7d}%` : "—"}
                </td>
                <td className="px-5 py-4">
                  <SslStatusBadge health={monitor.sslHealth} daysLeft={monitor.sslDaysLeft} />
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {onRefresh ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={refreshingId === monitor.websiteId || !monitor.monitorEnabled}
                        onClick={() => onRefresh(monitor.websiteId)}
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingId === monitor.websiteId ? "animate-spin" : ""}`} />
                      </Button>
                    ) : null}
                    <Link
                      href={`/dashboard/monitoring/${monitor.websiteId}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      详情
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
        共 {formatNumber(monitors.length)} 个站点 · 后台每 60 秒自动检测
      </div>
    </Card>
  );
}
