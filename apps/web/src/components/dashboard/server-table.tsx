"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Server, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonitorStatusBadge } from "@/components/dashboard/monitor-status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/utils";

export type ServerListItem = {
  id: string;
  name: string;
  hostname: string;
  online: boolean;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  load1: number | null;
  lastReportedAt: string | null;
};

export function ServerTable({ servers }: { servers: ServerListItem[] }) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(server: ServerListItem) {
    const confirmed = await confirm({
      title: "删除服务器",
      description: `确定删除「${server.name}」？相关监控数据将一并删除，此操作不可恢复。`,
      confirmLabel: "删除",
      destructive: true,
    });
    if (!confirmed) return;

    setDeletingId(server.id);
    const response = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
    setDeletingId(null);

    if (!response.ok) {
      toast.error("删除失败，请稍后重试");
      return;
    }

    toast.success(`已删除服务器「${server.name}」`);
    router.refresh();
  }

  if (servers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Server className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold">还没有服务器</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            添加服务器并安装 Agent 探针，即可监控 CPU、内存、磁盘与负载
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">服务器</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">CPU</th>
              <th className="px-5 py-3 font-medium">内存</th>
              <th className="px-5 py-3 font-medium">磁盘</th>
              <th className="px-5 py-3 font-medium">负载</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.id} className="border-b border-border/80 last:border-0 hover:bg-muted/30">
                <td className="px-5 py-4">
                  <p className="font-medium">{server.name}</p>
                  <p className="text-xs text-muted-foreground">{server.hostname}</p>
                </td>
                <td className="px-5 py-4">
                  <MonitorStatusBadge status={server.online ? "up" : "down"} />
                </td>
                <td className="px-5 py-4 tabular-nums">{server.cpuPercent != null ? `${server.cpuPercent.toFixed(1)}%` : "—"}</td>
                <td className="px-5 py-4 tabular-nums">{server.memPercent != null ? `${server.memPercent}%` : "—"}</td>
                <td className="px-5 py-4 tabular-nums">{server.diskPercent != null ? `${server.diskPercent}%` : "—"}</td>
                <td className="px-5 py-4 tabular-nums">{server.load1 != null ? server.load1.toFixed(2) : "—"}</td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === server.id}
                      onClick={() => handleDelete(server)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Link
                      href={`/dashboard/servers/${server.id}`}
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
        共 {formatNumber(servers.length)} 台 · 超过 5 分钟无上报视为离线
      </div>
    </Card>
  );
}
