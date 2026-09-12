import { createServerFn } from "@tanstack/react-start"
import bcrypt from "bcryptjs"
import {
  createApiKey,
  createFunnel,
  createGoal,
  createSharedLink,
  createSite,
  createUser,
  deleteApiKey,
  deleteFunnel,
  deleteGoal,
  deleteSharedLink,
  deleteSite,
  deleteTeam,
  deleteUser,
  findPublicSite,
  findSharedLink,
  findSiteForUser,
  findTeamForUser,
  findUserByEmail,
  inviteMember,
  leaveTeam,
  listApiKeys,
  listFunnels,
  listGoals,
  listInvitations,
  listMembers,
  listPasskeys,
  listSharedLinks,
  listSites,
  removeMember,
  setupTeam,
  solelyOwnedTeams,
  suggestedTeamName,
  updateMemberRole,
  updateSite,
  updateTeamName,
  updateUser,
  type Goal,
  type Site,
} from "./db"
import {
  breakdown,
  exploreFunnel,
  exploreNext,
  funnelStats,
  goalStats,
  hasSiteEvents,
  ensureEventColumns,
  livePages,
  liveVisitorsGeo,
  propBreakdown,
  propKeys,
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
  googleOAuthEnabled,
  listGoogleProperties,
  saveBingAuth,
  searchTermsForSite,
  updateGoogleProperty,
} from "./keywords"
import { rangeFromSearch } from "./range"
import { clearSession, currentUser, requireUser, write2faPending, writeLocaleCookie, writeSession } from "./session"
import { getBackupSettings, restoreBackup, runBackup, saveBackupSettings, scanBackups, startBackupScheduler } from "./backup"
import { createMonitorServer, deleteMonitorServer, getMonitorHistory, getMonitorServer, getMonitorServerSecret, listMonitorServers, startMonitorCollectorNow } from "./monitor"
import { serverHealth, serverOnline } from "./monitor-view"
import { getSiteMonitor, latestSiteChecks, runSiteCheckNow, saveSiteMonitor, startSiteMonitor } from "./site-monitor"

export const loginFn = createServerFn({ method: "POST" })
  .validator((d: { email: string, password: string }) => d)
  .handler(async ({ data }) => {
    const user = await findUserByEmail(data.email.trim())
    if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
      throw new Error("邮箱或密码不正确")
    }
    if (user.totp_enabled) {
      write2faPending(user.id)
      return { needs2fa: true, email: user.email }
    }
    writeSession(user.id)
    return { id: user.id, email: user.email, name: user.name }
  })

export const registerFn = createServerFn({ method: "POST" })
  .validator((d: { email: string, password: string, name: string }) => d)
  .handler(async ({ data }) => {
    const user = await createUser(data.email, data.password, data.name)
    writeSession(user.id)
    return user
  })

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  clearSession()
  return { ok: true }
})

export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser()
  if (!user) return null
  const team = await findTeamForUser(user.id)
  return {
    ...user,
    theme: user.theme || "system",
    totp_enabled: !!user.totp_enabled,
    team: team ? { ...team, name: team.setup_complete ? team.name : "我的个人站点" } : null,
  }
})

export const statusPulseFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser()
  if (!user) return null
  const sites = await listSites(user.id)
  const [traffic, servers] = await Promise.all([
    todayTraffic(sites.map((site) => Number(site.id))).catch(() => ({ visitors: 0, visits: 0, pageviews: 0 })),
    listMonitorServers().catch(() => []),
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
  .validator((d: { domain: string, timezone: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await createSite(user.id, data.domain, data.timezone)
    void runSiteCheckNow(site.id, site.domain).catch(() => {})
    return site
  })

export const siteReadyFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    return { ready: await hasSiteEvents(site.id) }
  })

type DashInput = {
  domain: string
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

function filterFrom(data: DashInput, goals: Goal[]): Filter {
  return {
    source: data.source,
    page: data.page,
    country: data.country,
    browser: data.browser,
    os: data.os,
    device: data.device,
    goal: goals.find((g) => g.id === data.goalId) || null,
  }
}

async function loadDashboard(site: Site, data: DashInput) {
  await ensureEventColumns().catch(() => undefined)
  startBackupScheduler()
  const range = rangeFromSearch(data)
  const goals = await listGoals(site.id)
  const filter = filterFrom(data, goals)
  const [over, sources, pages, entryPages, exitPages, countries, regions, cities, browsers, devices, os, funnels, keys, recent, live, liveGeo, utm, campaigns, channels, utmMediums, hostnames, heatmap, titles, languages, screens, queries, keywords] = await Promise.all([
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
    listFunnels(site.id),
    propKeys(site.id, range, filter, site.allowed_event_props),
    recentEvents(site.id, filter),
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
  const goalRows = await Promise.all(goals.map(async (g) => ({ ...g, ...await goalStats(site.id, range, g, { ...filter, goal: null }) })))
  const propKey = data.propKey || keys[0] || ""
  const props = propKey ? await propBreakdown(site.id, range, propKey, filter) : []
  const funnel = funnels.find((f) => f.id === data.funnelId) || funnels[0]
  const funnelResult = funnel ? await funnelStats(site.id, range, funnel, { ...filter, goal: null }) : null
  const next = await exploreNext(site.id, range, [], filter)
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
    recent,
    live,
    liveGeo,
    heatmap,
    titles,
    languages,
    screens,
    queries,
    keywords,
    searchTerms,
    goals: goalRows,
    propKeys: keys,
    propKey,
    props,
    funnels: funnels.map((f) => ({ id: f.id, name: f.name, steps: f.steps.length })),
    funnel: funnelResult,
    funnelId: funnel?.id || null,
    explore: next,
    shares: await listSharedLinks(site.id).catch(() => []),
  }
}

export const dashboardFn = createServerFn({ method: "GET" })
  .validator((d: DashInput) => d)
  .handler(async ({ data }) => {
    const user = await currentUser()
    const site = user
      ? await findSiteForUser(user.id, data.domain)
      : await findPublicSite(data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    return loadDashboard(site, data)
  })

export const shareDashboardFn = createServerFn({ method: "GET" })
  .validator((d: DashInput & { slug: string }) => d)
  .handler(async ({ data }) => {
    const found = await findSharedLink(data.slug)
    if (!found) throw new Error("分享链接不存在")
    return { ...await loadDashboard(found.site, { ...data, domain: found.site.domain }), shareName: found.link.name }
  })

export const exploreFn = createServerFn({ method: "GET" })
  .validator((d: DashInput & { journey: Array<{ name: string, pathname: string }> }) => d)
  .handler(async ({ data }) => {
    const user = await currentUser()
    const site = user ? await findSiteForUser(user.id, data.domain) : await findPublicSite(data.domain)
    if (!site) throw new Error("没有权限")
    const range = rangeFromSearch(data)
    const goals = await listGoals(site.id)
    const filter = filterFrom(data, goals)
    const [next, path] = await Promise.all([
      exploreNext(site.id, range, data.journey || [], filter),
      exploreFunnel(site.id, range, data.journey || [], filter),
    ])
    return { next, path }
  })

export const saveGoalFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, display_name?: string, event_name?: string, page_path?: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    return createGoal(site.id, data)
  })

export const removeGoalFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await deleteGoal(site.id, data.id)
    return { ok: true }
  })

export const saveFunnelFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, name: string, goalIds: number[] }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await createFunnel(site.id, data.name, data.goalIds)
    return { ok: true }
  })

export const removeFunnelFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await deleteFunnel(site.id, data.id)
    return { ok: true }
  })

export const siteSettingsFn = createServerFn({ method: "GET" })
  .validator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("站点不存在或没有权限")
    const [google, bing] = await Promise.all([
      getGoogleAuth(site.id).catch(() => null),
      getBingAuth(site.id).catch(() => null),
    ])
    return {
      site,
      goals: await listGoals(site.id),
      funnels: (await listFunnels(site.id)).map((f) => ({ id: f.id, name: f.name, steps: f.steps.length })),
      shares: await listSharedLinks(site.id).catch(() => []),
      members: await listMembers(user.id),
      google: google ? { email: google.email, property: google.property, properties: await listGoogleProperties(site.id).catch(() => []) } : null,
      bing: bing ? { site_url: bing.site_url, connected: true } : null,
      googleOAuth: googleOAuthEnabled(),
      googleAuthUrl: googleOAuthEnabled() ? googleAuthorizeUrl(site.id) : "",
      monitor: await getSiteMonitor(site.id, site.domain),
    }
  })

export const saveSettingsFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, timezone: string, allowed_event_props: string[], public?: boolean, newDomain?: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await updateSite(site.id, {
      timezone: data.timezone,
      allowed_event_props: data.allowed_event_props,
      public: data.public,
      domain: data.newDomain,
    })
    return { domain: data.newDomain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase() || data.domain }
  })

export const removeSiteFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await deleteSite(site.id)
    return { ok: true }
  })

export const createShareFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, name: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    return createSharedLink(site.id, data.name)
  })

export const removeShareFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await deleteSharedLink(site.id, data.id)
    return { ok: true }
  })

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator((d: { name?: string, password?: string, oldPassword?: string, email?: string, theme?: string, avatar?: string | null, locale?: string }) => d)
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

export const teamFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const team = await findTeamForUser(user.id)
  return {
    team,
    suggestedName: suggestedTeamName(user.name),
    members: await listMembers(user.id),
    invitations: await listInvitations(user.id),
  }
})

export const inviteFn = createServerFn({ method: "POST" })
  .validator((d: { email: string, role: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await inviteMember(user.id, data.email.trim(), data.role)
    return { ok: true }
  })

export const setupTeamFn = createServerFn({ method: "POST" })
  .validator((d: { name: string, invites: Array<{ email: string, role: string }> }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return setupTeam(user.id, data.name, data.invites)
  })

export const updateTeamNameFn = createServerFn({ method: "POST" })
  .validator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await updateTeamName(user.id, data.name)
    return { ok: true }
  })

export const updateMemberRoleFn = createServerFn({ method: "POST" })
  .validator((d: { email: string, role: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await updateMemberRole(user.id, data.email, data.role)
    return { ok: true }
  })

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await removeMember(user.id, data.email)
    return { ok: true }
  })

export const leaveTeamFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser()
  await leaveTeam(user.id)
  return { ok: true }
})

export const deleteTeamFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser()
  await deleteTeam(user.id)
  return { ok: true }
})

export const accountSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const team = await findTeamForUser(user.id)
  return {
    user: { ...user, theme: user.theme || "system", totp_enabled: !!user.totp_enabled, locale: user.locale || "zh-CN" },
    team,
    keys: await listApiKeys(user.id),
    passkeys: await listPasskeys(user.id),
    solelyOwned: await solelyOwnedTeams(user.id),
    members: await listMembers(user.id),
    invitations: await listInvitations(user.id),
  }
})

export const createApiKeyFn = createServerFn({ method: "POST" })
  .validator((d: { name: string, type: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return createApiKey(user.id, data.name, data.type)
  })

export const removeApiKeyFn = createServerFn({ method: "POST" })
  .validator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await deleteApiKey(user.id, data.id)
    return { ok: true }
  })

export const deleteAccountFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser()
  await deleteUser(user.id)
  clearSession()
  return { ok: true }
})

export const siteDomainsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return (await listSites(user.id)).map((s) => ({ domain: s.domain }))
})

export const saveBingFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, apiKey: string, siteUrl: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await saveBingAuth(site.id, data.apiKey, data.siteUrl)
    return { ok: true }
  })

export const removeBingFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await deleteBingAuth(site.id)
    return { ok: true }
  })

export const saveGooglePropertyFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, property: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await updateGoogleProperty(site.id, data.property)
    return { ok: true }
  })

export const removeGoogleFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await deleteGoogleAuth(site.id)
    return { ok: true }
  })

export const backupSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser()
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
  .validator((d: {
    provider: "r2" | "s3"
    endpoint: string
    region: string
    bucket: string
    prefix: string
    access_key?: string
    secret_key?: string
    schedule: "off" | "hourly" | "daily" | "weekly"
    hour: number
    minute: number
    weekday: number
    enabled: boolean
  }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    const cur = await getBackupSettings()
    await saveBackupSettings({
      ...data,
      access_key: data.access_key && data.access_key !== "••••••••" ? data.access_key : cur.access_key,
      secret_key: data.secret_key && data.secret_key !== "••••••••" ? data.secret_key : cur.secret_key,
    })
    return { ok: true }
  })

export const runBackupFn = createServerFn({ method: "POST" }).handler(async () => {
  await requireUser()
  return runBackup("manual")
})

export const scanBackupFn = createServerFn({ method: "POST" })
  .validator((d?: { endpoint?: string, region?: string, bucket?: string, prefix?: string, access_key?: string, secret_key?: string, provider?: "r2" | "s3" }) => d || {})
  .handler(async ({ data }) => {
    await requireUser()
    const cur = await getBackupSettings()
    return scanBackups({
      ...cur,
      ...data,
      access_key: data.access_key && data.access_key !== "••••••••" ? data.access_key : cur.access_key,
      secret_key: data.secret_key && data.secret_key !== "••••••••" ? data.secret_key : cur.secret_key,
    })
  })

export const restoreBackupFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    return restoreBackup(data.id)
  })

export const saveSiteMonitorFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string, enabled: boolean, url?: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    await saveSiteMonitor(site.id, { enabled: data.enabled, url: data.url })
    if (data.enabled) await runSiteCheckNow(site.id, site.domain).catch(() => {})
    return getSiteMonitor(site.id, site.domain)
  })

export const runSiteMonitorFn = createServerFn({ method: "POST" })
  .validator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const site = await findSiteForUser(user.id, data.domain)
    if (!site) throw new Error("没有权限")
    return runSiteCheckNow(site.id, site.domain)
  })

export const serversFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser()
  await startMonitorCollectorNow()
  return listMonitorServers()
})

export const serverFn = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    await startMonitorCollectorNow()
    const server = await getMonitorServer(data.id)
    if (!server) throw new Error("找不到服务器")
    return server
  })

export const serverHistoryFn = createServerFn({ method: "GET" })
  .validator((d: { id: string, hours: number }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    return getMonitorHistory(data.id, data.hours)
  })

export const addServerFn = createServerFn({ method: "POST" })
  .validator((d: { name?: string }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    return createMonitorServer(data.name || "")
  })

export const removeServerFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    await deleteMonitorServer(data.id)
    return { ok: true }
  })

export const serverInstallFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireUser()
    return getMonitorServerSecret(data.id)
  })
