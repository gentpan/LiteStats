import { UIIcon } from "./UIIcon"
import { UserAvatar } from "./UserAvatar"
import { Link, useRouter, useRouterState, type AnyRouter } from "@tanstack/react-router"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { BrandMark, LogoMark } from "./BrandMark"
import { logoutFn, trafficPulseFn, updateProfileFn } from "~/lib/actions"
import { numberShort } from "~/lib/format"
import { useT } from "~/lib/i18n"
import { createThemeUpdate } from "~/lib/theme-update"

type ShellUser = {
  isAdmin?: boolean
  name: string
  email: string
  avatar?: string | null
  gravatarUrl?: string
  theme?: string
  locale?: string
} | null | undefined

type TrafficPulse = {
  sites: { count: number, visitors: number, visits: number, pageviews: number }
}

function fill(template: string, n: number) {
  return template.replace("{n}", numberShort(n))
}

function FooterPulse({ user }: { user?: ShellUser }) {
  const { t } = useT()
  const [pulse, setPulse] = useState<TrafficPulse | null>(null)

  useEffect(() => {
    if (!user) return
    let alive = true
    const load = () => {
      void trafficPulseFn().then((data) => {
        if (alive && data) setPulse(data)
      }).catch(() => {})
    }
    load()
    const timer = window.setInterval(load, 30_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [user])

  if (!user || !pulse) return <span />

  return (
    <Link to="/dashboard" className="site-footer-pulse">
      <span>{fill(t("footer.sites"), pulse.sites.count)}</span>
      <span className="site-footer-pulse-dot" aria-hidden="true">·</span>
      <span>{fill(t("footer.today_visitors"), pulse.sites.visitors)}</span>
      <span className="site-footer-pulse-dot" aria-hidden="true">·</span>
      <span>{fill(t("footer.today_visits"), pulse.sites.visits)}</span>
      <span className="site-footer-pulse-dot" aria-hidden="true">·</span>
      <span>{fill(t("footer.today_views"), pulse.sites.pageviews)}</span>
    </Link>
  )
}

export function SiteFooter({ user }: { user?: ShellUser }) {
  const { t } = useT()
  return (
    <footer className="site-footer">
      <div className="container-ls site-footer-inner">
        <Link to={user ? "/dashboard" : "/"} className="site-footer-brand">
          <LogoMark />
          <span className="logo-wordmark">
            <span className="logo-wordmark-lite">Lite</span>
            <span className="logo-wordmark-stats">Stats</span>
          </span>
        </Link>
        <FooterPulse user={user} />
        <p className="site-footer-meta">
          <span>© {new Date().getFullYear()} LiteStats</span>
          <span aria-hidden="true">·</span>
          <span>{t("footer.own")}</span>
        </p>
      </div>
    </footer>
  )
}

export function Shell({
  user,
  children,
  layout = "management",
}: {
  user?: ShellUser
  children: React.ReactNode
  layout?: "management" | "analytics"
}) {
  // The URL changes before the next loader completes; keep the visible page's
  // layout until its component is replaced instead of styling it as the target.
  return (
    <div className={`flex min-h-full flex-col${layout === "management" ? " management-shell" : ""}`}>
      <SiteHeader user={user} />
      <main className="container-ls flex-1 pb-10">{children}</main>
      <SiteFooter user={user} />
    </div>
  )
}

function headerNav(t: (key: string) => string): HeaderNavItem[] {
  const items: HeaderNavItem[] = [
    { key: "sites", to: "/dashboard", label: t("nav.sites") },
    { key: "account", to: "/account", search: { tab: "preferences" }, label: t("settings.title") },
    { key: "api", to: "/docs/api", label: "API" },
  ]
  return items
}

function navActive(key: string, pathname: string) {
  if (key === "sites") return pathname === "/dashboard" || pathname.startsWith("/sites/") || pathname === "/sites" || pathname.startsWith("/share/")
  if (key === "account") return pathname === "/account"
  if (key === "backup") return pathname === "/backup"
  if (key === "api") return pathname === "/docs/api"
  return false
}

type HeaderNavItem = {
  key: string
  to: "/dashboard" | "/account" | "/backup" | "/docs/api"
  search?: { tab: string }
  label: string
}

function HeaderNav({
  items,
  pathname,
}: {
  items: HeaderNavItem[]
  pathname: string
}) {
  const { t } = useT()
  return (
    <nav className="site-header-nav" aria-label={t("主导航")}>
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          search={item.search}
          aria-current={navActive(item.key, pathname) ? "page" : undefined}
          className={`squircle site-header-nav-link${navActive(item.key, pathname) ? " is-active" : ""}`}
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  )
}

function ThemeSwitch({ theme, onChange, disabled }: { theme: string, disabled?: boolean, onChange: (next: string) => void }) {
  const { t } = useT()
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => setSystemDark(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const resolved = theme === "dark" || (theme !== "light" && systemDark) ? "dark" : "light"

  const dark = resolved === "dark"
  return <button type="button" className={`squircle theme-toggle${dark ? " is-dark" : ""}`} disabled={disabled}
    aria-label={t(dark ? "切换到浅色模式" : "切换到深色模式")}
    title={t(dark ? "切换到浅色模式" : "切换到深色模式")}
    onClick={() => onChange(dark ? "light" : "dark")}>
    <UIIcon name="sun" className="theme-toggle-sun"/>
    <UIIcon name="moon" className="theme-toggle-moon"/>
  </button>
}

const themeUpdates = new WeakMap<AnyRouter, ReturnType<typeof createThemeUpdate>>()
function themeUpdateFor(router: AnyRouter) {
  let update = themeUpdates.get(router)
  if (!update) {
    update = createThemeUpdate(
      theme => updateProfileFn({data: {theme}}),
      async () => { router.clearCache(); await router.invalidate({sync: true}) },
    )
    themeUpdates.set(router, update)
  }
  return update
}

function HeaderTools({ user }: { user: NonNullable<ShellUser> }) {
  const { t } = useT()
  const update = themeUpdateFor(useRouter())
  const snapshot = useSyncExternalStore(update.subscribe, update.getSnapshot, () => undefined)
  const change = snapshot?.email === user.email ? snapshot : undefined
  const theme = change?.theme || user.theme || "system"
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (query.matches ? "dark" : "light") : theme }
    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
  }, [theme])
  return (
    <div className="site-header-tools">
      <ThemeSwitch theme={theme} disabled={change?.pending} onChange={next => { void update.change(user.email, theme, next) }} />
      {change?.failed ? <span className="squircle header-feedback" role="alert">{t("外观保存失败，请重试")}</span> : null}
    </div>
  )
}

function SiteHeader({ user }: { user?: ShellUser }) {
  const { t } = useT()
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname
  const items = user ? headerNav(t) : []

  return (
    <header className="site-header">
      <div className="container-ls">
        <div className="site-header-bar">
          <Link to={user ? "/dashboard" : "/"} className="site-header-brand">
            <BrandMark />
          </Link>
          {user ? <HeaderNav items={items} pathname={pathname} /> : <span className="hidden md:block" />}
          <div className="site-header-actions">
            {user ? (
              <>
                <HeaderTools user={user} />
                <UserMenu user={user} items={items} pathname={pathname} />
              </>
            ) : (
              <>
                <Link to="/login" className="squircle site-header-link">{t("nav.login")}</Link>
                <Link to="/register" className="squircle btn btn-primary btn-sm">{t("nav.register")}</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function UserMenu({
  user,
  items,
  pathname,
}: {
  user: NonNullable<ShellUser>
  items: HeaderNavItem[]
  pathname: string
}) {
  const router = useRouter()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && menuRef.current?.querySelector('[role="menu"]')) {setOpen(false);triggerRef.current?.focus()}
    }
    window.addEventListener("mousedown", onClick)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onClick)
      window.removeEventListener("keydown", onKey)
    }
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="squircle site-header-user"
        ref={triggerRef}
        aria-label={t("账户菜单")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="selection-detail hidden truncate text-sm font-medium text-gray-800 md:block">{user.name || user.email}</span>
        <UserAvatar avatar={user.avatar} gravatarUrl={user.gravatarUrl} name={user.name || user.email} className="site-header-avatar" />
        <UIIcon name="chevron-down" className="ui-chevron" />
      </button>
      {open ? (
        <div className="squircle site-header-menu" role="menu">
          <div className="site-header-menu-meta">
            <div className="text-xs text-gray-500">{t("nav.signed_in")}</div>
            <p className="truncate font-medium text-gray-900">{user.email}</p>
          </div>
          <div className="site-header-menu-mobile">
            <div className="site-header-menu-line" />
            {items.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                search={item.search}
                aria-current={navActive(item.key, pathname) ? "page" : undefined}
                className={`squircle site-header-menu-item${navActive(item.key, pathname) ? " is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {t(item.label)}
              </Link>
            ))}
          </div>
          <div className="site-header-menu-line" />
          <button
            type="button"
            className="squircle site-header-menu-item w-full text-left"
            onClick={async () => {
              await logoutFn()
              await router.navigate({ to: "/login" })
            }}
          >
            {t("nav.logout")}
          </button>
        </div>
      ) : null}
    </div>
  )
}
