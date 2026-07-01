"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Globe2,
  LayoutDashboard,
  Server,
  Settings2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteFavicon } from "@/components/dashboard/site-favicon";

export type SidebarWebsite = {
  id: string;
  name: string;
  domain: string;
};

type AppSidebarProps = {
  username: string;
  websites: SidebarWebsite[];
  activeWebsiteId?: string;
};

const mainNav = [
  { href: "/dashboard", label: "总览", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/websites", label: "站点", icon: Globe2 },
  { href: "/dashboard/servers", label: "服务器", icon: Server },
  { href: "/dashboard/settings", label: "账户设置", icon: Settings2 },
];

export function AppSidebar({ username, websites, activeWebsiteId }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">LiteStats</p>
          <p className="text-xs text-sidebar-muted">Analytics Console</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
          导航
        </p>
        <nav className="space-y-1">
          {mainNav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
          站点
        </p>
        <nav className="space-y-1">
          {websites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-sidebar-border px-3 py-4 text-xs text-sidebar-muted">
              暂无站点，前往站点页面添加
            </div>
          ) : (
            websites.map((website) => {
              const href = `/dashboard/${website.id}`;
              const active = activeWebsiteId === website.id || pathname.startsWith(href);
              return (
                <Link
                  key={website.id}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    active
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                >
                  <SiteFavicon domain={website.domain} name={website.name} size="md" className="bg-white/5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{website.name}</span>
                    <span className="block truncate text-xs opacity-70">{website.domain}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })
          )}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-lg bg-sidebar-accent/80 px-3 py-3">
          <div className="flex items-center gap-2 text-xs text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            隐私优先统计
          </div>
          <p className="mt-1 text-xs text-sidebar-muted">无 Cookie · 数据归你所有</p>
          <p className="mt-3 truncate text-sm font-medium text-white">{username}</p>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ websites, activeWebsiteId }: Pick<AppSidebarProps, "websites" | "activeWebsiteId">) {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-border bg-white px-4 py-3 lg:hidden">
      <Link
        href="/dashboard/servers"
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
          pathname.startsWith("/dashboard/servers") ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        服务器
      </Link>
      <Link
        href="/dashboard/websites"
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
          pathname.startsWith("/dashboard/websites") ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        站点
      </Link>
      <Link
        href="/dashboard"
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
          pathname === "/dashboard" ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        总览
      </Link>
      {websites.map((website) => (
        <Link
          key={website.id}
          href={`/dashboard/${website.id}`}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
            activeWebsiteId === website.id || pathname.startsWith(`/dashboard/${website.id}`)
              ? "bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          {website.name}
        </Link>
      ))}
    </div>
  );
}

export function AnalyticsIcon() {
  return <BarChart3 className="h-4 w-4" />;
}
