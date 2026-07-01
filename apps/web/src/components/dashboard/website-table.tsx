import Link from "next/link";
import { ArrowUpRight, Globe2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SiteFavicon } from "@/components/dashboard/site-favicon";
import { formatNumber } from "@/lib/utils";

export type WebsiteListItem = {
  id: string;
  name: string;
  domain: string;
  trackingId: string;
  pageviews?: number;
  uniqueVisitors?: number;
};

export function WebsiteTable({ websites }: { websites: WebsiteListItem[] }) {
  if (websites.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Globe2 className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold">还没有站点</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            创建第一个站点后，即可获取追踪代码并开始采集访问数据
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
              <th className="px-5 py-3 font-medium">站点</th>
              <th className="px-5 py-3 font-medium">域名</th>
              <th className="px-5 py-3 font-medium">7 日 PV</th>
              <th className="px-5 py-3 font-medium">7 日 UV</th>
              <th className="px-5 py-3 font-medium">Tracking ID</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {websites.map((website) => (
              <tr key={website.id} className="border-b border-border/80 last:border-0 hover:bg-muted/30">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3 font-medium">
                    <SiteFavicon domain={website.domain} name={website.name} size="sm" />
                    {website.name}
                  </div>
                </td>
                <td className="px-5 py-4 text-muted-foreground">{website.domain}</td>
                <td className="px-5 py-4 tabular-nums">{formatNumber(website.pageviews ?? 0)}</td>
                <td className="px-5 py-4 tabular-nums">{formatNumber(website.uniqueVisitors ?? 0)}</td>
                <td className="px-5 py-4">
                  <Badge className="font-mono">{website.trackingId.slice(0, 10)}...</Badge>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/dashboard/${website.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    查看统计
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
