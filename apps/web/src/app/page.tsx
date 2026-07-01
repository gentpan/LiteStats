import { Activity, ArrowRight, BarChart3, Shield, Zap } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Shield,
    title: "隐私优先",
    description: "无 Cookie、不存原始 IP，默认符合 GDPR 友好实践。",
  },
  {
    icon: Zap,
    title: "轻量快速",
    description: "Tracker 不足 1KB，Bun 运行时带来更快的开发与部署体验。",
  },
  {
    icon: BarChart3,
    title: "专业面板",
    description: "趋势图、来源分析、设备 breakdown，一目了然。",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">LiteStats</p>
            <p className="text-xs text-muted-foreground">Bun · Next.js · PostgreSQL</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            登录
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-emerald-700"
          >
            进入控制台
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-16 text-center lg:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">
            Open Analytics Platform
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground lg:text-6xl">
            简单、专业、可自托管的网站统计
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            融合 Plausible 的简洁体验与 Umami 的易部署架构。一套 Bun 全栈方案，不需要 Go，也不需要复杂运维。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-emerald-700"
            >
              开始使用
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-white px-5 text-sm font-medium hover:bg-muted"
            >
              管理员登录
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <CardContent className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
}
