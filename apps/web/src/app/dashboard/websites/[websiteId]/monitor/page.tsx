import { MonitorDetailPanel } from "@/components/dashboard/monitor-detail-panel";

export default async function WebsiteMonitorPage({
  params,
}: {
  params: Promise<{ websiteId: string }>;
}) {
  const { websiteId } = await params;
  return <MonitorDetailPanel websiteId={websiteId} />;
}
