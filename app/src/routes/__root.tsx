import { compactDashSearch } from "~/lib/range"
import { PageState } from "~/components/PageState"
import { useEffect, useRef, type ReactNode } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from "@tanstack/react-router"
import { I18nProvider, isLocale } from "~/lib/i18n"
import { localeFn } from "~/lib/auth-actions"
import appCss from "~/styles/app.css?url"

export const Route = createRootRoute({
  search: {middlewares:[({search,next})=>{
    const result = next(search) as Record<string,unknown>
    const clean = "period" in result ? compactDashSearch(result) : {...result}
    if(clean.tab === "preferences" || clean.tab === "general") delete clean.tab
    if(clean.window === "24h") delete clean.window
    return clean
  }]},
  loader: async () => ({ locale: await localeFn() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LiteStats" },
      { name: "description", content: "LiteStats 网站访问统计" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preload", href: "/fonts/sora-semibold.ttf", as: "font", type: "font/ttf", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/sora-regular.ttf", as: "font", type: "font/ttf", crossOrigin: "anonymous" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const router = useRouter()
  const maskedEntry = useRef("")
  const location = useRouterState({select: state=>state.location})
  useEffect(()=>{
    const maskable = location.pathname === "/account" || /^\/sites\/[^/]+(?:\/(?:settings|activity))?\/?$/.test(location.pathname) || location.pathname.startsWith("/share/")
    if(maskable && router.options.routeMasks?.length && window.location.search && maskedEntry.current !== window.location.href) {
      maskedEntry.current = window.location.href
      void router.navigate({to:location.pathname,search:true,replace:true,state:previous=>({...previous,hideSearch:true}),mask:{to:location.pathname,search:{}}})
    }
  },[router,location])

  const { locale } = Route.useLoaderData()
  const resolved = isLocale(locale) ? locale : "zh-CN"
  return (
    <I18nProvider locale={resolved}>
      <RootDocument locale={resolved}>
        <Outlet />
      </RootDocument>
    </I18nProvider>
  )
}

function RootDocument({ children, locale }: { children: ReactNode, locale: string }) {
  return (
    <html lang={locale === "en" ? "en" : "zh-CN"} className="h-full">
      <head>
        <HeadContent />
      </head>
      <body className="h-full bg-gray-50 text-gray-800">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return <PageState title="页面不存在" />
}
