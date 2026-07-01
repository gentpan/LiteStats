import { redirect } from "next/navigation";

export default async function MonitoringDetailRedirectPage({
  params,
}: {
  params: Promise<{ websiteId: string }>;
}) {
  const { websiteId } = await params;
  redirect(`/dashboard/websites/${websiteId}/monitor`);
}
