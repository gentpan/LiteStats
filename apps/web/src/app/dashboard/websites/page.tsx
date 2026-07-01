import { PageHeader } from "@/components/dashboard/page-header";
import { CreateWebsiteCard } from "@/components/dashboard/create-website-card";
import { WebsiteTable } from "@/components/dashboard/website-table";
import { getSession } from "@/lib/auth";
import { getOverviewStats } from "@/lib/analytics";

export default async function WebsitesPage() {
  const session = await getSession();
  if (!session) return null;

  const overview = await getOverviewStats(session.userId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Websites"
        title="站点管理"
        description="创建、管理你的网站，并获取对应的追踪代码与统计数据。"
      />

      <CreateWebsiteCard />
      <WebsiteTable websites={overview.websiteStats} />
    </div>
  );
}
