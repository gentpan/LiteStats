import { compactDashSearch } from "~/lib/range"
import { PageState } from "~/components/PageState"
import { useEffect, useRef, type ReactNode } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from "@tanstack/react-router"
import { I18nProvider, isLocale } from "~/lib/i18n"
import { rootPreferencesFn } from "~/lib/auth-actions"
import { ACCENT_BOOTSTRAP_SCRIPT, ACCENT_FAVICON_BOOTSTRAP_SCRIPT, subscribeAccentColor, syncAccentFavicon } from "~/lib/accent-preference"
import { SITE_LAYOUT_BOOTSTRAP_SCRIPT, subscribeSiteLayout } from "~/lib/site-layout-preference"
import { themeBootstrapScript, type ThemePreference } from "~/lib/theme-appearance"
import { MapStyleProvider } from "~/lib/map-preferences"
import appCss from "~/styles/app.css?url"

export const Route = createRootRoute({
  search: {middlewares:[({search,next})=>{
    const result = next(search) as Record<string,unknown>
    const clean = "period" in result ? compactDashSearch(result) : {...result}
    if(clean.tab === "preferences" || clean.tab === "general") delete clean.tab
    if(clean.window === "24h") delete clean.window
    return clean
  }]},
  loader: async () => rootPreferencesFn(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LiteStats" },
      { name: "description", content: "LiteStats 网站访问统计" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: "https://static.bluecdn.com/libs/fontawesome-pro-plus/7.3.1/css/all.min.css" },
      { rel: "stylesheet", href: appCss },
      { id: "app-favicon", rel: "icon", type: "image/svg+xml", href: "/favicon.svg?v=2" },
      { rel: "preload", href: "/fonts/sora-semibold.ttf", as: "font", type: "font/ttf", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/sora-regular.ttf", as: "font", type: "font/ttf", crossOrigin: "anonymous" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  // Keep an open dashboard in sync with color changes made in another tab.
  useEffect(() => {
    syncAccentFavicon()
    return subscribeAccentColor(() => {})
  }, [])
  useEffect(() => subscribeSiteLayout(() => {}), [])
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

  const { locale, theme, mapboxStyle } = Route.useLoaderData()
  const resolved = isLocale(locale) ? locale : "zh-CN"
  return (
    <I18nProvider locale={resolved}>
      <MapStyleProvider styleId={mapboxStyle}>
        <RootDocument locale={resolved} theme={theme}>
          <Outlet />
        </RootDocument>
      </MapStyleProvider>
    </I18nProvider>
  )
}

function RootDocument({ children, locale, theme }: { children: ReactNode, locale: string; theme: ThemePreference }) {
  return (
    <html lang={locale === "en" ? "en" : "zh-CN"} className="h-full" data-accent="purple" data-theme={theme === "dark" ? "dark" : "light"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SITE_LAYOUT_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript(theme) }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: ACCENT_FAVICON_BOOTSTRAP_SCRIPT }} />
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
