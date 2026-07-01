import { ServerDetailPanel } from "@/components/dashboard/server-detail-panel";

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <ServerDetailPanel serverId={serverId} />;
}
