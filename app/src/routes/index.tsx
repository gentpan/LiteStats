import { createFileRoute, redirect } from "@tanstack/react-router"
import { MarketingHome } from "~/components/MarketingHome"
import landingCss from "~/styles/landing.css?url"

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): {gsc?: "expired"} => ({gsc: search.gsc === "expired" ? "expired" : undefined}),
  beforeLoad: ({search}) => {
    if (search.gsc === "expired") throw redirect({to: "/dashboard", search: {gsc: "expired"}})
  },
  head: () => ({
    meta: [
      {title: "LiteStats · 简单、好看的网站统计"},
      {name: "description", content: "开源、自托管的网站访问统计。用清晰的图表了解访客、流量来源和页面表现，数据留在自己的服务器。"},
      {name: "robots", content: "index,follow"},
      {property: "og:title", content: "LiteStats · 简单、好看的网站统计"},
      {property: "og:description", content: "看清网站表现，让数据回到自己手里。开源 · 自托管 · 无 Cookie 访客采集。"},
      {property: "og:type", content: "website"},
    ],
    links: [{rel: "stylesheet", href: landingCss}],
  }),
  component: MarketingHome,
})
