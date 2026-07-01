import { PageHeader } from "@/components/dashboard/page-header";
import { CreateWebsiteCard } from "@/components/dashboard/create-website-card";
import { WebsiteTable } from "@/components/dashboard/website-table";
import { getSession } from "@/lib/auth";
import { getOverviewStats } from "@/lib/analytics";
import { getMonitorSummaries } from "@/lib/monitor";

export default async function WebsitesPage() {
  const session = await getSession();
  if (!session) return null;

  const [overview, monitors] = await Promise.all([
    getOverviewStats(session.userId),
    getMonitorSummaries(session.userId),
  ]);

  const monitorMap = new Map(monitors.map((item) => [item.websiteId, item]));
  const websites = overview.websiteStats.map((website) => {
    const monitor = monitorMap.get(website.id);
    return {
      ...website,
      monitorStatus: monitor?.status,
      monitorEnabled: monitor?.monitorEnabled,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Websites"
        title="站点管理"
        description="在此添加、删除站点。站点与「站点监控」共用同一份数据，删除站点会同时清除统计与监控记录。"
      />

      <CreateWebsiteCard />
      <WebsiteTable websites={websites} />
    </div>
  );
}
