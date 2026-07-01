import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { WebsiteTable } from "@/components/dashboard/website-table";
import { getSession } from "@/lib/auth";
import { getOverviewStats } from "@/lib/analytics";
import { Eye, Globe2, Radio, Users } from "lucide-react";
import Link from "next/link";

export default async function DashboardOverviewPage() {
  const session = await getSession();
  if (!session) return null;

  const overview = await getOverviewStats(session.userId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={`欢迎回来，${session.username}`}
        description="过去 7 天的全站数据概览。选择左侧站点查看详细分析。"
        actions={
          <Link
            href="/dashboard/websites"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-emerald-700"
          >
            站点
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="站点数量" value={overview.totals.websiteCount} icon={Globe2} />
        <MetricCard label="7 日页面浏览量" value={overview.totals.pageviews} icon={Eye} />
        <MetricCard label="7 日独立访客" value={overview.totals.uniqueVisitors} icon={Users} />
        <MetricCard
          label="当前在线访客"
          value={overview.totals.liveVisitors}
          hint="全站过去 5 分钟活跃"
          accent="live"
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">站点表现</h2>
            <p className="text-sm text-muted-foreground">点击站点进入详细统计面板</p>
          </div>
        </div>
        <WebsiteTable websites={overview.websiteStats} />
      </section>
    </div>
  );
}
