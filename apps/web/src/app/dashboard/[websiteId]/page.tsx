import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { SiteFavicon } from "@/components/dashboard/site-favicon";
import { TrackingCodePanel } from "@/components/dashboard/tracking-code-panel";
import { WebsiteStatsPanel } from "@/components/dashboard/website-stats-panel";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export default async function WebsiteDashboardPage({
  params,
}: {
  params: Promise<{ websiteId: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const { websiteId } = await params;
  const website = await prisma.website.findFirst({
    where: { id: websiteId, userId: session.userId },
  });

  if (!website) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Website Analytics"
        leading={<SiteFavicon domain={website.domain} name={website.name} size="lg" />}
        title={website.name}
        description={website.domain}
        actions={<Badge className="font-mono text-[11px]">ID: {website.trackingId}</Badge>}
      />

      <WebsiteStatsPanel websiteId={website.id} />

      <TrackingCodePanel trackingId={website.trackingId} />
    </div>
  );
}
