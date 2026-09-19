import { googleOAuthSchema, googleOAuthPublicConfig, saveGoogleOAuthConfig } from "./google-oauth-settings"
import { gravatarUrl } from "./avatar"
import { channelInput } from "./channel-schema"
import { getChannelSettings, saveChannelSettings, verifyChannelSettings, clearChannelSettings } from "./channel-settings"
import { getMapSettings, saveMapSettings } from "./map-settings"
import { mapSettingsSchema } from "./map-validation"
import { z } from "zod"
import { text, dashboardSchema } from "./validation"
import { createServerFn } from "@tanstack/react-start"
import bcrypt from "bcryptjs"
import {
  createApiKey,
  createSharedLink,
  createSite,
  createUser,
  deleteApiKey,
  deleteSharedLink,
  deleteSite,
  findPublicSite,
  findSharedLink,
  findSiteForUser,
  findUserByEmail,
  listApiKeys,
  listPasskeys,
  listSharedLinks,
  listSites,
  updateSite,
  updateUser,
  type Site,
} from "./db"
import {
  breakdown,
  hasSiteEvents,
  ensureEventColumns,
  livePages,
  recentVisitors,
  liveVisitorsGeo,
  recentEvents,
  sessionPages,
  siteOverview,
  siteSummaries,
  todayTraffic,
  visitHeatmap,
  type Filter,
} from "./ch"
import {
  deleteBingAuth,
  deleteGoogleAuth,
  getBingAuth,
  getGoogleAuth,
  googleAuthorizeUrl,
  listGoogleProperties,
  saveBingAuth,
  searchTermsForSite,
  updateGoogleProperty,
} from "./keywords"
import { rangeFromSearch } from "./range"
import { clearSession, currentUser, requireUser, requireAdmin, isInstanceAdmin, write2faPending, writeLocaleCookie, writeSession } from "./session"
import { getBackupSettings, restoreBackup, runBackup, saveBackupSettings, scanBackups, startBackupScheduler } from "./backup"
import { createMonitorServer, deleteMonitorServer, getMonitorHistory, getMonitorServer, getMonitorServerSecret, listMonitorServers, startMonitorCollectorNow } from "./monitor"
import { serverHealth, serverOnline } from "./monitor-view"
import { getSiteMonitorHistory, getSiteMonitor, latestSiteChecks, runSiteCheckNow, saveSiteMonitor, startSiteMonitor } from "./site-monitor"

export const loginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({email: text, password: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await findUserByEmail(data.email.trim())
    if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
      throw new Error("邮箱或密码不正确")
    }
    if (user.totp_enabled) {
      write2faPending(user.id)
      return { needs2fa: true, email: user.email }
    }
    await writeSession(user.id)
    return { id: user.id, email: user.email, name: user.name }
  })

export const registerFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({email: text, password: text, name: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await createUser(data.email, data.password, data.name)
    await writeSession(user.id)
    return user
  })

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  clearSession()
  return { ok: true }
})

export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser()
  if (!user) return null
  return {
    ...user,
    gravatarUrl: gravatarUrl(user.email),
    isAdmin: isInstanceAdmin(user),
    theme: user.theme || "system",
    totp_enabled: !!user.totp_enabled,
  }
})

export const statusPulseFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser()
  if (!user) return null
  const sites = await listSites(user.id)
  const [traffic, servers] = await Promise.all([
    todayTraffic(sites.map((site) => Number(site.id))).catch(() => ({ visitors: 0, visits: 0, pageviews: 0 })),
    isInstanceAdmin(user) ? listMonitorServers().catch(() => []) : Promise.resolve([]),
  ])
  let online = 0
  let warn = 0
  let down = 0
  for (const server of servers) {
    const health = serverHealth(server)
    if (health === "down") down += 1
    else if (health === "warn") {
      online += 1
      warn += 1
    } else if (serverOnline(server.last_seen_at)) {
      online += 1
    }
  }
  return {
    sites: { count: sites.length, ...traffic },
    servers: { count: servers.length, online, warn, down },
  }
})

export const sitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  startSiteMonitor()
  const sites = await listSites(user.id)
  const stats = await siteSummaries(sites.map((s) => s.id))
  const monitors = await latestSiteChecks(sites.map((s) => Number(s.id)))
  return sites.map((s) => {
    const stat = stats.get(Number(s.id)) || { visitors: 0, live: 0, change: 0, sparkline: [] }
    return {
      ...s,
      id: Number(s.id),
      visitors: stat.visitors,
      live: stat.live,
      change: stat.change,
      sparkline: stat.sparkline,
      monitor: monitors.get(Number(s.id)) || null,
    }
  })
})

export const createSiteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, timezone: text, name: text.optional().nullable()}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await createSite(user.id, data.domain, data.timezone, data.name)
    return site
  })

export const siteReadyFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    return { ready: await hasSiteEvents(site.id) }
  })

type DashInput = {
  domain: string
  hostname?: string
  utm?: string
  period?: string
  days?: number
  from?: string
  to?: string
  interval?: string
  propKey?: string
  funnelId?: number
  source?: string
  page?: string
  country?: string
  browser?: string
  os?: string
  device?: string
  goalId?: number
}

function filterFrom(data: DashInput): Filter {
  return {
    hostname: data.hostname,
    utm: data.utm,
    source: data.source,
    page: data.page,
    country: data.country,
    browser: data.browser,
    os: data.os,
    device: data.device,
  }
}

async function loadDashboard(site: Site, data: DashInput) {
  await ensureEventColumns().catch(() => undefined)
  startBackupScheduler()
  const range = rangeFromSearch(data, site.timezone)
  const filter = filterFrom(data)
  const [over, sources, pages, entryPages, exitPages, countries, regions, cities, browsers, devices, os, live, liveGeo, utm, campaigns, channels, utmMediums, hostnames, heatmap, titles, languages, screens, queries, keywords] = await Promise.all([
    siteOverview(site.id, range, filter, (data.interval as "minute" | "hour" | "day" | "week" | "month") || "day"),
    breakdown(site.id, range, "source", filter),
    breakdown(site.id, range, "page", filter),
    sessionPages(site.id, range, "entry", filter),
    sessionPages(site.id, range, "exit", filter),
    breakdown(site.id, range, "country", filter),
    breakdown(site.id, range, "region", filter),
    breakdown(site.id, range, "city", filter).catch(() => []),
    breakdown(site.id, range, "browser", filter),
    breakdown(site.id, range, "device", filter),
    breakdown(site.id, range, "os", filter),
    livePages(site.id),
    liveVisitorsGeo(site.id),
    breakdown(site.id, range, "utm_source", filter, 50),
    breakdown(site.id, range, "utm_campaign", filter, 50),
    breakdown(site.id, range, "channel", filter, 50),
    breakdown(site.id, range, "utm_medium", filter, 50),
    breakdown(site.id, range, "hostname", filter, 50),
    visitHeatmap(site.id, range, filter, site.timezone).catch(() => []),
    breakdown(site.id, range, "title", filter).catch(() => []),
    breakdown(site.id, range, "language", filter).catch(() => []),
    breakdown(site.id, range, "screen", filter).catch(() => []),
    breakdown(site.id, range, "query", filter).catch(() => []),
    breakdown(site.id, range, "keyword", filter).catch(() => []),
  ])
  const searchTerms = await searchTermsForSite(site.id, range, keywords).catch(() => ({
    google: { configured: false, rows: [] },
    bing: { configured: false, rows: [] },
    organic: keywords,
  }))
  return {
    site,
    range,
    ...over,
    sources,
    pages,
    entryPages,
    exitPages,
    countries,
    regions,
    cities,
    browsers,
    devices,
    os,
    utm,
    campaigns,
    channels,
    utmMediums,
    hostnames,
    live,
    liveGeo,
    heatmap,
    titles,
    languages,
    screens,
    queries,
    keywords,
    searchTerms,
  }
}

export const dashboardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => dashboardSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    const memberSite = user ? await findSiteForUser(user.id, data.domain) : null
    const site = memberSite || await findPublicSite(data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    return { ...await loadDashboard(site, data), mapConfig: memberSite ? await getMapSettings(site.id) : null }
  })

export const shareDashboardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.intersection(dashboardSchema, z.object({slug: text})).parse(input))
  .handler(async ({ data }) => {
    const found = await findSharedLink(data.slug)
    if (!found) throw new Error("分享链接不存在")
    return { ...await loadDashboard(found.site, { ...data, domain: found.site.domain }), shareName: found.link.name }
  })

export const siteSettingsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("站点不存在或没有权限")
    const [google, bing] = await Promise.all([
      getGoogleAuth(site.id).catch(() => null),
      getBingAuth(site.id).catch(() => null),
    ])
    return {
      site,
      mapConfig: await getMapSettings(site.id),
      shares: await listSharedLinks(site.id),
      google: google ? { email: google.email, property: google.property, properties: await listGoogleProperties(site.id).catch(() => []) } : null,
      bing: bing ? { site_url: bing.site_url, connected: true } : null,
      googleOAuth: await googleOAuthPublicConfig(site.id),
      googleAuthUrl: await googleAuthorizeUrl(site.id),
      monitor: await getSiteMonitor(site.id, site.domain),
    }
  })

export const saveSettingsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    domain: text,
    name: text.optional().nullable(),
    timezone: text,
    allowed_event_props: z.array(text).max(100).optional(),
    public: z.boolean().optional(),
    newDomain: text.optional()
  }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    await updateSite(site.id, {
      name: data.name,
      timezone: data.timezone,
      allowed_event_props: data.allowed_event_props,
      public: data.public,
      domain: data.newDomain,
    })
    return { domain: data.newDomain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase() || data.domain }
  })

export const removeSiteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    await deleteSite(site.id)
    return { ok: true }
  })

export const createShareFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, name: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    return createSharedLink(site.id, data.name)
  })

export const removeShareFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, id: z.number().finite()}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    await deleteSharedLink(site.id, data.id)
    return { ok: true }
  })

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({name: text.optional(), password: text.optional(), oldPassword: text.optional(), email: text.optional(), theme: text.optional(), avatar: z.union([z.string().max(220_000), z.null()]).optional(), locale: text.optional()}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (data.avatar) {
      if (!data.avatar.startsWith("data:image/")) throw new Error("请上传图片")
      if (data.avatar.length > 220_000) throw new Error("图片太大，请换一张更小的")
    }
    if (data.locale) writeLocaleCookie(data.locale)
    await updateUser(user.id, data)
    return { ok: true }
  })

export const accountSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return {
    user: { ...user, gravatarUrl: gravatarUrl(user.email), isAdmin: isInstanceAdmin(user), theme: user.theme || "system", totp_enabled: !!user.totp_enabled, locale: user.locale || "zh-CN" },
    sites: (await listSites(user.id)).map(site=>({domain:site.domain,timezone:site.timezone || "UTC"})),
    keys: await listApiKeys(user.id),
    passkeys: await listPasskeys(user.id),
  }
})

export const createApiKeyFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({name: text, type: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return createApiKey(user.id, data.name, data.type)
  })

export const removeApiKeyFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({id: z.number().finite()}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await deleteApiKey(user.id, data.id)
    return { ok: true }
  })

export const siteDomainsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return (await listSites(user.id)).map((s) => ({ domain: s.domain, name: s.name }))
})

export const saveBingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, apiKey: text, siteUrl: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    await saveBingAuth(site.id, data.apiKey, data.siteUrl)
    return { ok: true }
  })

export const removeBingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    await deleteBingAuth(site.id)
    return { ok: true }
  })

export const saveGooglePropertyFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, property: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    await updateGoogleProperty(site.id, data.property)
    return { ok: true }
  })

export const removeGoogleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    await deleteGoogleAuth(site.id)
    return { ok: true }
  })

export const backupSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  startBackupScheduler()
  const s = await getBackupSettings()
  return {
    ...s,
    access_key: (s.access_key ? "••••••••" : "") as string,
    secret_key: (s.secret_key ? "••••••••" : "") as string,
    has_keys: !!(s.access_key && s.secret_key),
  }
})

export const saveBackupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({provider: z.union([z.literal("r2"), z.literal("s3")]), endpoint: text, region: text, bucket: text, prefix: text, access_key: text.optional(), secret_key: text.optional(), schedule: z.union([z.literal("off"), z.literal("hourly"), z.literal("daily"), z.literal("weekly")]), hour: z.number().finite(), minute: z.number().finite(), weekday: z.number().finite(), enabled: z.boolean()}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    const cur = await getBackupSettings()
    await saveBackupSettings({
      ...data,
      access_key: data.access_key && data.access_key !== "••••••••" ? data.access_key : cur.access_key,
      secret_key: data.secret_key && data.secret_key !== "••••••••" ? data.secret_key : cur.secret_key,
    })
    return { ok: true }
  })

export const runBackupFn = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin()
  return runBackup("manual")
})

export const scanBackupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({endpoint: text.optional(), region: text.optional(), bucket: text.optional(), prefix: text.optional(), access_key: text.optional(), secret_key: text.optional(), provider: z.union([z.literal("r2"), z.literal("s3")]).optional()}).optional().transform(value => value || {}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    const cur = await getBackupSettings()
    return scanBackups({
      ...cur,
      ...data,
      access_key: data.access_key && data.access_key !== "••••••••" ? data.access_key : cur.access_key,
      secret_key: data.secret_key && data.secret_key !== "••••••••" ? data.secret_key : cur.secret_key,
    })
  })

export const restoreBackupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({id: text}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    return restoreBackup(data.id)
  })

export const saveSiteMonitorFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, enabled: z.boolean(), url: text.optional()}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    await saveSiteMonitor(site.id, { enabled: data.enabled, url: data.url })
    if (data.enabled) await runSiteCheckNow(site.id, site.domain).catch(() => {})
    return getSiteMonitor(site.id, site.domain)
  })

export const siteMonitorHistoryFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({
    domain: text,
    days: z.union([z.literal(7), z.literal(30)]),
    page: z.number().int().min(1).max(100000),
    asOf: z.string().datetime(),
  }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    return getSiteMonitorHistory(site.id, data.days, data.page, data.asOf)
  })

export const runSiteMonitorFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "write")
    if (!site) throw new Error("没有权限")
    return runSiteCheckNow(site.id, site.domain)
  })

export const serversFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  await startMonitorCollectorNow()
  return listMonitorServers()
})

export const serverFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({id: text}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    await startMonitorCollectorNow()
    const server = await getMonitorServer(data.id)
    if (!server) throw new Error("找不到服务器")
    return server
  })

export const serverHistoryFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({id: text, hours: z.number().finite()}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    return getMonitorHistory(data.id, data.hours)
  })

export const addServerFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({name: text.optional()}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    return createMonitorServer(data.name || "")
  })

export const removeServerFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({id: text}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    await deleteMonitorServer(data.id)
    return { ok: true }
  })

export const serverInstallFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({id: text}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    return getMonitorServerSecret(data.id)
  })

export const saveMapSettingsFn = createServerFn({method: "POST"})
  .validator((input: unknown) => mapSettingsSchema.parse(input))
  .handler(async ({data}) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    await saveMapSettings(site.id, {provider: data.provider, apiKey: data.apiKey, googleStyle: data.googleStyle, mapboxToken: data.mapboxToken, mapboxStyle: data.mapboxStyle, mapboxCustomStyle: data.mapboxCustomStyle})
    return {ok: true}
  })

export const systemSettingsFn = createServerFn({method:"GET"}).handler(async()=>{
  await requireAdmin()
  return getChannelSettings()
})
export const saveChannelFn = createServerFn({method:"POST"})
  .validator((input:unknown)=>channelInput.parse(input))
  .handler(async({data})=>{await requireAdmin();return saveChannelSettings(data)})
export const verifyChannelFn = createServerFn({method:"POST"})
  .validator((input:unknown)=>z.object({channel:z.enum(["smtp","telegram"])}).parse(input))
  .handler(async({data})=>{await requireAdmin();return verifyChannelSettings(data.channel)})
export const clearChannelFn = createServerFn({method:"POST"})
  .validator((input:unknown)=>z.object({channel:z.enum(["smtp","telegram"])}).parse(input))
  .handler(async({data})=>{await requireAdmin();return clearChannelSettings(data.channel)})

export const activityFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({domain: text, window: z.enum(["30m", "24h", "7d"]).default("24h")}).parse(input))
  .handler(async ({data}) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    const rows = await recentEvents(site.id, {}, 201, {"30m":30,"24h":1440,"7d":10080}[data.window])
    return { rows: rows.slice(0,200), hasMore: rows.length > 200, timezone: site.timezone || "UTC", fetchedAt: new Date().toISOString() }
  })

export const recentVisitorsFn = createServerFn({method: "GET"})
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({data}) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    await ensureEventColumns()
    return {...await recentVisitors(site.id), timezone: site.timezone || "UTC", fetchedAt: new Date().toISOString()}
  })

export const saveGoogleOAuthConfigFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => googleOAuthSchema.extend({domain: text}).parse(input))
  .handler(async ({data}) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    await saveGoogleOAuthConfig(site.id, data)
    return {ok: true}
  })
