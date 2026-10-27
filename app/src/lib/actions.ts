import { dashboardMapboxToken } from "./mapbox-settings"
import { runSiteCheck, saveSiteCheck, siteCertificateExpiries, siteCheckReport } from "./site-checks"
import { createSearchIntegrationHandlers } from "./search-integration-security"
import { dashboardKeywordPack } from "./keyword-report"
import { googleOAuthSchema, googleOAuthPublicConfig, saveGoogleOAuthConfig } from "./google-oauth-settings"
import { gravatarUrl } from "./avatar"
import { z } from "zod"
import { text, dashboardSchema, timezoneSchema } from "./validation"
import { safeTimezone } from "./date-time"
import { createServerFn } from "@tanstack/react-start"
import { instanceSetupSchema } from "./instance-setup"
import bcrypt from "bcryptjs"
import {
  createSharedLink,
  createSite,
  createUser,
  deleteSharedLink,
  deleteSite,
  findPublicSite,
  findSharedLink,
  findSiteForUser,
  findUserByEmail,
  instanceNeedsSetup,
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
import { backupOperationError, getBackupSettings, publicBackupSettings, readBackupSettings, restoreBackup, runBackup, saveBackupSettings, scanBackups, startBackupScheduler } from "./backup"
import { backupConnectionSchema, createBackupConnectionHandler, resolveBackupConnection, testBackupConnection } from "./backup-connection"

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

export const instanceSetupFn = createServerFn({ method: "GET" }).handler(async () => ({needsSetup: await instanceNeedsSetup()}))

async function setupAdmin(data: z.infer<typeof instanceSetupSchema>) {
  const user = await createUser(data.email, data.password, data.name)
  await writeSession(user.id)
  return user
}

export const setupAdminFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => instanceSetupSchema.parse(input))
  .handler(({ data }) => setupAdmin(data))

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

export const trafficPulseFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser()
  if (!user) return null
  const sites = await listSites(user.id)
  const traffic = await todayTraffic(sites.map((site) => Number(site.id)))
    .catch(() => ({ visitors: 0, visits: 0, pageviews: 0 }))
  return { sites: { count: sites.length, ...traffic } }
})

export const sitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const sites = await listSites(user.id)
  const [stats, certificateExpiries] = await Promise.all([
    siteSummaries(sites.map((s) => s.id)),
    siteCertificateExpiries(sites.map((s) => s.id)),
  ])
  return sites.map((s) => {
    const stat = stats.get(Number(s.id)) || { visitors: 0, visits: 0, pageviews: 0, live: 0, change: 0, sparkline: [] }
    return {
      ...s,
      id: Number(s.id),
      certificateExpiresAt: certificateExpiries.get(Number(s.id)) || null,
      visitors: stat.visitors,
      visits: stat.visits,
      pageviews: stat.pageviews,
      live: stat.live,
      change: stat.change,
      sparkline: stat.sparkline,
    }
  })
})

export const createSiteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, timezone: timezoneSchema, name: text.optional().nullable()}).parse(input))
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
  const [over, sources, pages, entryPages, exitPages, countries, regions, cities, browsers, devices, os, liveGeo, utm, campaigns, channels, utmMediums, hostnames, heatmap, titles, languages, screens, queries, keywords] = await Promise.all([
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
  const mapboxToken = await dashboardMapboxToken()
  const searchTerms = await searchTermsForSite(site.id, range, keywords).catch(() => ({
    google: { configured: false, rows: [], error: "request_failed" as const },
    bing: { configured: false, rows: [], error: "request_failed" as const },
    organic: keywords,
  }))
  return {
    site,
    mapboxToken,
    health: null,
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
    liveGeo,
    heatmap,
    titles,
    languages,
    screens,
    queries,
    keywords,
    searchTerms: {
      ...searchTerms,
      google: dashboardKeywordPack(searchTerms.google),
      bing: dashboardKeywordPack(searchTerms.bing),
    },
  }
}

export const dashboardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => dashboardSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    const memberSite = user ? await findSiteForUser(user.id, data.domain) : null
    const site = memberSite || await findPublicSite(data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    const [dashboard, health] = await Promise.all([
      loadDashboard(site, data),
      memberSite ? siteCheckReport(site).catch(() => null) : Promise.resolve(null),
    ])
    return { ...dashboard, health, access: {member: !!memberSite, canManage: ["owner", "admin"].includes(memberSite?.role || "")} }
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
      health: await siteCheckReport(site).catch(() => null),
      shares: await listSharedLinks(site.id),
      google: google ? { email: google.email, property: google.property, properties: await listGoogleProperties(site.id).catch(() => []) } : null,
      bing: bing ? { site_url: bing.site_url, connected: true } : null,
      googleOAuth: await googleOAuthPublicConfig(site.id),
      googleAuthUrl: await googleAuthorizeUrl(site.id, user.id).catch(() => ""),
    }
  })

export const saveSettingsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    domain: text,
    name: text.optional().nullable(),
    timezone: timezoneSchema.optional(),
    allowed_event_props: z.array(text).max(100).optional(),
    public: z.boolean().optional(),
    newDomain: text.optional(),
    healthEnabled: z.boolean().optional(),
    healthPath: z.string().min(1).max(2048).optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain, "admin")
    if (!site) throw new Error("没有权限")
    const domain = await updateSite(site.id, {
      name: data.name,
      timezone: data.timezone,
      allowed_event_props: data.allowed_event_props,
      public: data.public,
      domain: data.newDomain,
    })
    if (data.healthEnabled !== undefined) {
      await saveSiteCheck(site, data.healthEnabled, data.healthPath || "/")
      if (data.healthEnabled) await runSiteCheck(site.id, true)
    }
    return { domain }
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
    passkeys: await listPasskeys(user.id),
  }
})

export const siteDomainsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return (await listSites(user.id)).map((s) => ({ domain: s.domain, name: s.name }))
})

const searchIntegrationHandlers = createSearchIntegrationHandlers({
  user: requireUser, site: findSiteForUser, saveBing: saveBingAuth, removeBing: deleteBingAuth,
  googleProperties: listGoogleProperties, saveGoogleProperty: updateGoogleProperty, removeGoogle: deleteGoogleAuth,
})

export const saveBingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, apiKey: z.string().trim().min(1).max(4096), siteUrl: z.string().trim().min(1).max(2048)}).parse(input))
  .handler(({ data }) => searchIntegrationHandlers.saveBing(data))

export const removeBingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(({ data }) => searchIntegrationHandlers.removeBing(data))

export const saveGooglePropertyFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text, property: z.string().trim().min(1).max(255)}).parse(input))
  .handler(({ data }) => searchIntegrationHandlers.saveGoogleProperty(data))

export const removeGoogleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(({ data }) => searchIntegrationHandlers.removeGoogle(data))

export const backupSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  startBackupScheduler()
  return publicBackupSettings(await getBackupSettings())
})

const backupConnectionHandler = createBackupConnectionHandler({admin: requireAdmin, read: readBackupSettings, probe: testBackupConnection})

export const testBackupConnectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => backupConnectionSchema.parse(input))
  .handler(({ data }) => backupConnectionHandler(data))

export const saveBackupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => backupConnectionSchema.extend({schedule: z.enum(["off", "hourly", "daily", "weekly"]), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), weekday: z.number().int().min(0).max(6), enabled: z.boolean()}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    const cur = await getBackupSettings()
    await saveBackupSettings({
      ...data,
      ...resolveBackupConnection(data, cur),
    })
    return { ok: true, settings: publicBackupSettings(await getBackupSettings()) }
  })

export const runBackupFn = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin()
  return runBackup("manual").catch(error=>{throw new Error(backupOperationError(error))})
})

export const scanBackupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => backupConnectionSchema.partial().optional().transform(value => value || {}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    const cur = await getBackupSettings()
    return scanBackups(resolveBackupConnection({...cur, ...data, access_key: data.access_key, secret_key: data.secret_key}, cur)).catch(error=>{throw new Error(backupOperationError(error))})
  })

export const restoreBackupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({id: text}).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin()
    return restoreBackup(data.id).catch(error=>{throw new Error(backupOperationError(error))})
  })

export const activityFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({domain: text, window: z.enum(["30m", "24h", "7d"]).default("24h")}).parse(input))
  .handler(async ({data}) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    const rows = await recentEvents(site.id, {}, 201, {"30m":30,"24h":1440,"7d":10080}[data.window])
    return { rows: rows.slice(0,200), hasMore: rows.length > 200, timezone: safeTimezone(site.timezone), fetchedAt: new Date().toISOString() }
  })

export const recentVisitorsFn = createServerFn({method: "GET"})
  .validator((input: unknown) => z.object({domain: text}).parse(input))
  .handler(async ({data}) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    await ensureEventColumns()
    return {...await recentVisitors(site.id), timezone: safeTimezone(site.timezone), fetchedAt: new Date().toISOString()}
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
