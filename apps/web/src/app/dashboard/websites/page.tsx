import { SitesPanel } from "@/components/dashboard/sites-panel";
import { getSession } from "@/lib/auth";
import { getOverviewStats } from "@/lib/analytics";
import { getMonitorOverview } from "@/lib/monitor";

export default async function WebsitesPage() {
  const session = await getSession();
  if (!session) return null;

  const [overview, monitorOverview] = await Promise.all([
    getOverviewStats(session.userId),
    getMonitorOverview(session.userId),
  ]);

  const statsMap = new Map(
    overview.websiteStats.map((website) => [
      website.id,
      {
        pageviews: website.pageviews,
        uniqueVisitors: website.uniqueVisitors,
        trackingId: website.trackingId,
      },
    ]),
  );

  const initialSites = monitorOverview.monitors.map((monitor) => {
    const stats = statsMap.get(monitor.websiteId);
    return {
      id: monitor.websiteId,
      name: monitor.name,
      domain: monitor.domain,
      trackingId: stats?.trackingId ?? "",
      pageviews: stats?.pageviews ?? 0,
      uniqueVisitors: stats?.uniqueVisitors ?? 0,
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

  return <SitesPanel initialSites={initialSites} initialTotals={monitorOverview.totals} />;
}
