import { CreateServerCard } from "@/components/dashboard/create-server-card";
import { ServerTable } from "@/components/dashboard/server-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { getSession } from "@/lib/auth";
import { getServerSummaries } from "@/lib/server-monitor";
import { Server, Cpu } from "lucide-react";

export default async function ServersPage() {
  const session = await getSession();
  if (!session) return null;

  const servers = await getServerSummaries(session.userId);
  const online = servers.filter((server) => server.online).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Infrastructure"
        title="服务器监控"
        description="通过 Agent 探针采集目标服务器的 CPU、内存、磁盘与系统负载。与站点监控独立管理。"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="服务器总数" value={servers.length} icon={Server} />
        <MetricCard label="当前在线" value={online} hint={`${servers.length - online} 台离线`} accent="live" />
        <MetricCard label="平均 CPU" value={
          servers.length === 0
            ? "—"
            : `${(servers.filter((s) => s.cpuPercent != null).reduce((sum, s) => sum + (s.cpuPercent ?? 0), 0) / Math.max(1, servers.filter((s) => s.cpuPercent != null).length)).toFixed(1)}%`
        } icon={Cpu} />
      </div>

      <CreateServerCard />
      <ServerTable servers={servers} />
    </div>
  );
}
