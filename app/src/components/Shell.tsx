import { Link, useRouter, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { BrandMark, LogoMark } from "./BrandMark"
import { logoutFn, statusPulseFn, updateProfileFn } from "~/lib/actions"
import { numberShort } from "~/lib/format"
import { useT } from "~/lib/i18n"

type ShellUser = {
  name: string
  email: string
  avatar?: string | null
  theme?: string
  locale?: string
  team?: { setup_complete: boolean } | null
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
  wide,
}: {
  user?: ShellUser
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader user={user} />
      <main className={`${wide ? "mx-auto w-full max-w-[88rem] px-4" : "container-ls"} flex-1 pb-10`}>{children}</main>
      <SiteFooter user={user} />
    </div>
  )
}

function headerNav(user: NonNullable<ShellUser>, t: (key: string) => string): HeaderNavItem[] {
  const items: HeaderNavItem[] = [
    { key: "sites", to: "/", label: t("nav.sites") },
    { key: "servers", to: "/servers", label: t("nav.servers") },
    { key: "account", to: "/account", search: { tab: "preferences" }, label: t("nav.account") },
    { key: "backup", to: "/backup", label: t("nav.backup") },
  ]
  if (user.team && !user.team.setup_complete) {
    items.push({ key: "team", to: "/team/setup", label: t("nav.team_create") })
  } else if (user.team?.setup_complete) {
    items.push({ key: "team", to: "/account", search: { tab: "team/general" }, label: t("nav.team_settings") })
  }
  return items
}

function navActive(key: string, pathname: string, tab: string) {
  if (key === "sites") return pathname === "/" || pathname.startsWith("/sites") || pathname.startsWith("/share")
  if (key === "servers") return pathname === "/servers" || pathname.startsWith("/servers/")
  if (key === "account") return pathname === "/account" && !tab.startsWith("team/")
  if (key === "backup") return pathname === "/backup"
  if (key === "team") return pathname.startsWith("/team") || (pathname === "/account" && tab.startsWith("team/"))
  return false
}

type HeaderNavItem = {
  key: string
  to: "/" | "/servers" | "/account" | "/backup" | "/team/setup"
  search?: { tab: string }
  label: string
}

function HeaderNav({
  items,
  pathname,
  tab,
}: {
  items: HeaderNavItem[]
  pathname: string
  tab: string
}) {
  return (
    <nav className="site-header-nav" aria-label="主导航">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          search={item.search}
          className={`site-header-nav-link${navActive(item.key, pathname, tab) ? " is-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

const LOCALES = [
  { id: "zh-CN", flag: "/flags/cn.svg", language: "中文", country: "中国" },
  { id: "en", flag: "/flags/us.svg", language: "English", country: "United States" },
] as const

function LanguageSwitch({ locale, onChange }: { locale: string, onChange: (next: string) => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = LOCALES.find((item) => item.id === locale) || LOCALES[0]

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
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
    <div className="site-lang" ref={box}>
      <button
        type="button"
        className="site-lang-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("profile.language")}
        onClick={() => setOpen((v) => !v)}
      >
        <img src={current.flag} alt="" className="site-lang-flag" />
        <span className="site-lang-name">{current.language}</span>
        <svg className="site-lang-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open ? (
        <div className="site-lang-menu" role="listbox">
          {LOCALES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === current.id}
              className={`site-lang-option${item.id === current.id ? " is-on" : ""}`}
              onClick={() => {
                setOpen(false)
                if (item.id !== current.id) onChange(item.id)
              }}
            >
              <img src={item.flag} alt="" className="site-lang-flag" />
              <span className="site-lang-copy">
                <strong>{item.language}</strong>
                <em>{item.country}</em>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ThemeSwitch({ theme, onChange }: { theme: string, onChange: (next: string) => void }) {
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

  return (
    <div className="site-theme" role="group" aria-label={t("profile.appearance")}>
      <button
        type="button"
        className={`site-theme-btn${resolved === "light" ? " is-on" : ""}`}
        aria-pressed={resolved === "light"}
        aria-label={t("profile.theme_light")}
        onClick={() => onChange("light")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 3v1.6M12 19.4V21M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3 12h1.6M19.4 12H21M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1" />
        </svg>
      </button>
      <button
        type="button"
        className={`site-theme-btn${resolved === "dark" ? " is-on" : ""}`}
        aria-pressed={resolved === "dark"}
        aria-label={t("profile.theme_dark")}
        onClick={() => onChange("dark")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.2A8.2 8.2 0 0 1 8.8 3.5 7.4 7.4 0 1 0 20.5 15.2Z" />
        </svg>
      </button>
    </div>
  )
}

function HeaderTools({ user }: { user: NonNullable<ShellUser> }) {
  const { locale: currentLocale } = useT()
  const [locale, setLocale] = useState(user.locale === "en" || currentLocale === "en" ? "en" : "zh-CN")
  const [theme, setTheme] = useState(user.theme || "system")

  useEffect(() => {
    setLocale(user.locale === "en" || currentLocale === "en" ? "en" : "zh-CN")
    setTheme(user.theme || "system")
  }, [user.locale, user.theme, currentLocale])

  return (
    <div className="site-header-tools">
      <LanguageSwitch
        locale={locale}
        onChange={async (next) => {
          setLocale(next)
          await updateProfileFn({ data: { locale: next } })
          window.location.reload()
        }}
      />
      <ThemeSwitch
        theme={theme}
        onChange={async (next) => {
          setTheme(next)
          await updateProfileFn({ data: { theme: next } })
        }}
      />
    </div>
  )
}

function SiteHeader({ user }: { user?: ShellUser }) {
  const { t } = useT()
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname
  const tab = String((location.search as { tab?: string }).tab || "")
  const items = user ? headerNav(user, t) : []

  return (
    <header className="site-header">
      <div className="container-ls">
        <div className="site-header-bar">
          <Link to={user ? "/" : "/login"} className="site-header-brand">
            <BrandMark />
          </Link>
          {user ? <HeaderNav items={items} pathname={pathname} tab={tab} /> : <span />}
          <div className="site-header-actions">
            {user ? (
              <>
                <HeaderTools user={user} />
                <UserMenu user={user} items={items} pathname={pathname} tab={tab} />
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
  tab,
}: {
  user: NonNullable<ShellUser>
  items: HeaderNavItem[]
  pathname: string
  tab: string
}) {
  const router = useRouter()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initial = (user.name || user.email).slice(0, 1).toUpperCase()

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
        {user.avatar ? (
          <img className="site-header-avatar" src={user.avatar} alt="" />
        ) : (
          <span className="site-header-avatar">{initial}</span>
        )}
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
                className={`site-header-menu-item${navActive(item.key, pathname, tab) ? " is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {item.label}
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
