import { UserAvatar } from "./UserAvatar"
import { Link, useRouter, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { BrandMark, LogoMark } from "./BrandMark"
import { logoutFn, statusPulseFn, updateProfileFn } from "~/lib/actions"
import { numberShort } from "~/lib/format"
import { useT } from "~/lib/i18n"

type ShellUser = {
  isAdmin?: boolean
  name: string
  email: string
  avatar?: string | null
  gravatarUrl?: string
  theme?: string
  locale?: string
} | null | undefined

type StatusPulse = {
  sites: { count: number, visitors: number, visits: number, pageviews: number }
  servers: { count: number, online: number, warn: number, down: number }
}

function fill(template: string, n: number) {
  return template.replace("{n}", numberShort(n))
}

function FooterPulse({ user }: { user?: ShellUser }) {
  const { t } = useT()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [pulse, setPulse] = useState<StatusPulse | null>(null)
  const onServers = pathname === "/servers" || pathname.startsWith("/servers/")

  useEffect(() => {
    if (!user) return
    let alive = true
    const load = () => {
      void statusPulseFn().then((data) => {
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

  if (onServers) {
    const tone = pulse.servers.down ? "down" : pulse.servers.warn ? "warn" : "ok"
    const status = pulse.servers.down
      ? fill(t("footer.servers_down"), pulse.servers.down)
      : pulse.servers.warn
        ? fill(t("footer.servers_warn"), pulse.servers.warn)
        : t("footer.servers_ok")
    return (
      <Link to="/servers" className="site-footer-pulse">
        <span>{fill(t("footer.servers"), pulse.servers.count)}</span>
        <span className="site-footer-pulse-dot" aria-hidden="true">·</span>
        <span className={`site-footer-pulse-status is-${tone}`}>
          <span className="site-footer-dot" />
          {status}
        </span>
      </Link>
    )
  }

  return (
    <Link to="/" className="site-footer-pulse">
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
        <Link to={user ? "/" : "/login"} className="site-footer-brand">
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
}: {
  user?: ShellUser
  children: React.ReactNode
}) {
  const path = useRouterState({select: state=>state.location.pathname})
  const management = !/^\/sites\/[^/]+\/?$/.test(path) && !path.startsWith("/share/")
  return (
    <div className={`flex min-h-full flex-col${management ? " management-shell" : ""}`}>
      <SiteHeader user={user} />
      <main className="container-ls flex-1 pb-10">{children}</main>
      <SiteFooter user={user} />
    </div>
  )
}

function headerNav(user: NonNullable<ShellUser>, t: (key: string) => string): HeaderNavItem[] {
  const items: HeaderNavItem[] = [
    { key: "sites", to: "/", label: t("nav.sites") },
    { key: "servers", to: "/servers", label: t("nav.servers") },
    { key: "account", to: "/account", search: { tab: "preferences" }, label: t("settings.title") },
  ]
  return items.filter(item => user.isAdmin || !["servers", "backup"].includes(item.key))
}

function navActive(key: string, pathname: string) {
  if (key === "sites") return pathname === "/" || pathname.startsWith("/sites") || pathname.startsWith("/share")
  if (key === "servers") return pathname === "/servers" || pathname.startsWith("/servers/")
  if (key === "account") return pathname === "/account"
  if (key === "backup") return pathname === "/backup"
  return false
}

type HeaderNavItem = {
  key: string
  to: "/" | "/servers" | "/account" | "/backup"
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
          className={`site-header-nav-link${navActive(item.key, pathname) ? " is-active" : ""}`}
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
  return <button type="button" className={`theme-toggle${dark ? " is-dark" : ""}`} disabled={disabled}
    aria-label={t(dark ? "切换到浅色模式" : "切换到深色模式")}
    title={t(dark ? "切换到浅色模式" : "切换到深色模式")}
    onClick={() => onChange(dark ? "light" : "dark")}>
    <svg className="theme-toggle-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
    <svg className="theme-toggle-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 14.1A9 9 0 0 1 9.9 3.2 9 9 0 1 0 20.8 14.1Z"/></svg>
  </button>
}

function HeaderTools({ user }: { user: NonNullable<ShellUser> }) {
  const { t } = useT()
  const [theme, setTheme] = useState(user.theme || "system")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { setTheme(user.theme || "system") }, [user.theme])
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (query.matches ? "dark" : "light") : theme }
    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
  }, [theme])
  return (
    <div className="site-header-tools">
      <ThemeSwitch theme={theme} disabled={pending} onChange={async next => {
        const previous = theme
        setTheme(next); setError(""); setPending(true)
        try { await updateProfileFn({ data: { theme: next } }) }
        catch { setTheme(previous); setError(t("外观保存失败，请重试")) }
        finally { setPending(false) }
      }} />
      {error ? <span className="header-feedback" role="alert">{error}</span> : null}
    </div>
  )
}

function SiteHeader({ user }: { user?: ShellUser }) {
  const { t } = useT()
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname
  const items = user ? headerNav(user, t) : []

  return (
    <header className="site-header">
      <div className="container-ls">
        <div className="site-header-bar">
          <Link to={user ? "/" : "/login"} className="site-header-brand">
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
                <Link to="/login" className="site-header-link">{t("nav.login")}</Link>
                <Link to="/register" className="btn btn-primary btn-sm">{t("nav.register")}</Link>
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

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
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
        className="site-header-user"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hidden truncate text-sm font-medium text-gray-800 md:block">{user.name || user.email}</span>
        <UserAvatar avatar={user.avatar} gravatarUrl={user.gravatarUrl} name={user.name || user.email} className="site-header-avatar" />
      </button>
      {open ? (
        <div className="site-header-menu" role="menu">
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
                className={`site-header-menu-item${navActive(item.key, pathname) ? " is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {t(item.label)}
              </Link>
            ))}
          </div>
          <div className="site-header-menu-line" />
          <button
            type="button"
            className="site-header-menu-item w-full text-left"
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
