import { prisma } from "@/lib/db";
import { getCountryLabel } from "@/lib/flags";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

type UaInfo = {
  browser: string | null;
  os: string | null;
  device: string | null;
};

export function parseUserAgent(userAgent: string): UaInfo {
  const ua = userAgent.toLowerCase();
  let browser: string | null = null;
  let os: string | null = null;
  let device: string | null = "desktop";

  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome/")) browser = "Chrome";
  else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari";
  else if (ua.includes("firefox/")) browser = "Firefox";

  if (ua.includes("iphone") || ua.includes("ipad")) {
    os = "iOS";
    device = "mobile";
  } else if (ua.includes("android")) {
    os = "Android";
    device = "mobile";
  } else if (ua.includes("mac os")) os = "macOS";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("linux")) os = "Linux";

  return { browser, os, device };
}

export async function getOrCreateSession(params: {
  websiteId: string;
  visitorId: string;
  userAgent: string;
  country?: string | null;
}) {
  const ua = parseUserAgent(params.userAgent);
  const now = new Date();

  const existing = await prisma.session.findUnique({
    where: {
      websiteId_visitorId: {
        websiteId: params.websiteId,
        visitorId: params.visitorId,
      },
    },
  });

  if (existing && now.getTime() - existing.lastSeenAt.getTime() < SESSION_TIMEOUT_MS) {
    return prisma.session.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        ...(!existing.country && params.country ? { country: params.country } : {}),
      },
    });
  }

  if (existing) {
    return prisma.session.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        browser: ua.browser,
        os: ua.os,
        device: ua.device,
        country: params.country ?? existing.country,
      },
    });
  }

  return prisma.session.create({
    data: {
      websiteId: params.websiteId,
      visitorId: params.visitorId,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      country: params.country ?? null,
      lastSeenAt: now,
    },
  });
}

export type StatsRange = "24h" | "7d" | "30d";

const LIVE_WINDOW_MS = 5 * 60 * 1000;

export function getRangeStart(range: StatsRange) {
  const now = Date.now();
  const offsets: Record<StatsRange, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - offsets[range]);
}

function getBucketKey(date: Date, range: StatsRange) {
  if (range === "24h") {
    return date.toISOString().slice(0, 13);
  }
  return date.toISOString().slice(0, 10);
}

export async function getLiveVisitors(websiteId: string) {
  const since = new Date(Date.now() - LIVE_WINDOW_MS);
  return prisma.session.count({
    where: {
      websiteId,
      lastSeenAt: { gte: since },
    },
  });
}

export async function getWebsiteStats(websiteId: string, range: StatsRange) {
  const since = getRangeStart(range);
  const liveVisitors = await getLiveVisitors(websiteId);

  const events = await prisma.event.findMany({
    where: {
      websiteId,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      type: true,
      path: true,
      referrer: true,
      eventName: true,
      createdAt: true,
      sessionId: true,
      session: {
        select: {
          browser: true,
          os: true,
          device: true,
          country: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const pageviews = events.filter((e) => e.type === "pageview");
  const customEvents = events.filter((e) => e.type === "event");
  const uniqueVisitors = new Set(events.map((e) => e.sessionId)).size;
  const sessionPageviews = countBy(pageviews, (e) => e.sessionId);
  const pagesPerVisit =
    uniqueVisitors === 0
      ? 0
      : Number((pageviews.length / uniqueVisitors).toFixed(2));

  const timeseries = new Map<string, { pageviews: number; visitors: Set<string> }>();
  for (const event of pageviews) {
    const bucketKey = getBucketKey(event.createdAt, range);
    const bucket = timeseries.get(bucketKey) ?? { pageviews: 0, visitors: new Set<string>() };
    bucket.pageviews += 1;
    bucket.visitors.add(event.sessionId);
    timeseries.set(bucketKey, bucket);
  }

  const topPages = countBy(pageviews, (e) => e.path ?? "/");
  const topReferrers = countBy(
    pageviews.filter((e) => e.referrer),
    (e) => normalizeReferrer(e.referrer!),
  );
  const topEvents = countBy(
    customEvents.filter((e) => e.eventName),
    (e) => e.eventName!,
  );
  const browsers = countBy(pageviews, (e) => e.session.browser ?? "Unknown");
  const os = countBy(pageviews, (e) => e.session.os ?? "Unknown");
  const devices = countBy(pageviews, (e) => e.session.device ?? "Unknown");
  const countries = countBy(
    pageviews.filter((e) => e.session.country),
    (e) => e.session.country!,
  );

  return {
    range,
    since: since.toISOString(),
    pageviews: pageviews.length,
    uniqueVisitors,
    liveVisitors,
    customEvents: customEvents.length,
    pagesPerVisit,
    bounceRate:
      uniqueVisitors === 0
        ? 0
        : Math.round(
            ([...sessionPageviews.values()].filter((count) => count === 1).length /
              uniqueVisitors) *
              100,
          ),
    timeseries: [...timeseries.entries()].map(([time, data]) => ({
      time,
      pageviews: data.pageviews,
      visitors: data.visitors.size,
    })),
    topPages: toSortedList(topPages),
    topReferrers: toSortedList(topReferrers),
    topEvents: toSortedList(topEvents),
    browsers: toSortedList(browsers),
    os: toSortedList(os),
    devices: toSortedList(devices),
    countries: toSortedList(countries).map((row) => ({
      name: getCountryLabel(row.name),
      count: row.count,
      code: row.name,
    })),
  };
}

export async function getOverviewStats(userId: string) {
  const websites = await prisma.website.findMany({
    where: { userId },
    select: { id: true, name: true, domain: true, trackingId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const since = getRangeStart("7d");
  const websiteIds = websites.map((w) => w.id);

  if (websiteIds.length === 0) {
    return {
      websites,
      totals: {
        pageviews: 0,
        uniqueVisitors: 0,
        liveVisitors: 0,
        websiteCount: 0,
      },
      websiteStats: [],
    };
  }

  const events = await prisma.event.findMany({
    where: {
      websiteId: { in: websiteIds },
      createdAt: { gte: since },
      type: "pageview",
    },
    select: {
      websiteId: true,
      sessionId: true,
    },
  });

  const liveSince = new Date(Date.now() - LIVE_WINDOW_MS);
  const liveVisitors = await prisma.session.count({
    where: {
      websiteId: { in: websiteIds },
      lastSeenAt: { gte: liveSince },
    },
  });

  const websiteStats = websites.map((website) => {
    const siteEvents = events.filter((e) => e.websiteId === website.id);
    return {
      ...website,
      pageviews: siteEvents.length,
      uniqueVisitors: new Set(siteEvents.map((e) => e.sessionId)).size,
    };
  });

  return {
    websites,
    totals: {
      pageviews: events.length,
      uniqueVisitors: new Set(events.map((e) => e.sessionId)).size,
      liveVisitors,
      websiteCount: websites.length,
    },
    websiteStats,
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function toSortedList(map: Map<string, number>, limit = 10) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function normalizeReferrer(referrer: string) {
  try {
    return new URL(referrer).hostname;
  } catch {
    return referrer;
  }
}
