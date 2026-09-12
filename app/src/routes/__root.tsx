import type { ReactNode } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { I18nProvider, isLocale } from "~/lib/i18n"
import { localeFn } from "~/lib/auth-actions"
import appCss from "~/styles/app.css?url"

export const Route = createRootRoute({
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
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;800&display=swap" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <p className="p-8">页面不存在</p>,
})

function RootComponent() {
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
