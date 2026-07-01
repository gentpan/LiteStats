import { prisma } from "@/lib/db";
import {
  buildMonitorUrl,
  getSslHealth,
  runWebsiteMonitorCheck,
  type MonitorStatus,
  type SslHealth,
} from "@/lib/monitor-check";

export type MonitorRange = "24h" | "7d" | "30d";

const RANGE_MS: Record<MonitorRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function getMonitorRangeStart(range: MonitorRange) {
  return new Date(Date.now() - RANGE_MS[range]);
}

export async function executeMonitorCheck(websiteId: string) {
  const website = await prisma.website.findUnique({
    where: { id: websiteId },
    select: { id: true, domain: true, monitorUrl: true, monitorEnabled: true },
  });

  if (!website || !website.monitorEnabled) {
    return null;
  }

  const result = await runWebsiteMonitorCheck({
    domain: website.domain,
    monitorUrl: website.monitorUrl,
  });

  const sslValid = result.ssl.valid === null ? null : result.ssl.valid;
  const ssl = result.ssl;

  return prisma.monitorCheck.create({
    data: {
      websiteId: website.id,
      status: result.uptime.status,
      responseMs: result.uptime.responseMs,
      statusCode: result.uptime.statusCode,
      sslValid,
      sslExpiresAt: ssl.expiresAt ?? null,
      sslDaysLeft: ssl.daysLeft ?? null,
      sslIssuer: ssl.issuer ?? null,
      error: result.uptime.error ?? ssl.error,
    },
  });
}

export async function runAllMonitorChecks() {
  const websites = await prisma.website.findMany({
    where: { monitorEnabled: true },
    select: { id: true, name: true },
  });

  const results = [];
  for (const website of websites) {
    try {
      const check = await executeMonitorCheck(website.id);
      results.push({ websiteId: website.id, name: website.name, ok: !!check });
    } catch (error) {
      console.error(`Monitor check failed for ${website.name}:`, error);
      results.push({ websiteId: website.id, name: website.name, ok: false });
    }
  }

  return results;
}

function calcUptimePercent(checks: Array<{ status: string }>) {
  if (checks.length === 0) return null;
  const upCount = checks.filter((check) => check.status === "up").length;
  return Number(((upCount / checks.length) * 100).toFixed(2));
}

function avgResponseMs(checks: Array<{ responseMs: number | null; status: string }>) {
  const values = checks
    .filter((check) => check.status === "up" && check.responseMs != null)
    .map((check) => check.responseMs!);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export type MonitorSummary = {
  websiteId: string;
  name: string;
  domain: string;
  monitorEnabled: boolean;
  monitorUrl: string;
  status: MonitorStatus | "unknown";
  responseMs: number | null;
  statusCode: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  sslValid: boolean | null;
  sslDaysLeft: number | null;
  sslExpiresAt: string | null;
  sslIssuer: string | null;
  sslHealth: SslHealth;
  lastCheckedAt: string | null;
  error: string | null;
};

export async function getMonitorSummaries(userId: string): Promise<MonitorSummary[]> {
  const websites = await prisma.website.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      domain: true,
      monitorEnabled: true,
      monitorUrl: true,
      monitorChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
    },
  });

  const since24h = getMonitorRangeStart("24h");
  const since7d = getMonitorRangeStart("7d");

  const summaries: MonitorSummary[] = [];

  for (const website of websites) {
    const latest = website.monitorChecks[0];
    const monitorUrl = buildMonitorUrl(website.domain, website.monitorUrl);

    let uptime24h: number | null = null;
    let uptime7d: number | null = null;

    if (website.monitorEnabled) {
      const [checks24h, checks7d] = await Promise.all([
        prisma.monitorCheck.findMany({
          where: { websiteId: website.id, checkedAt: { gte: since24h } },
          select: { status: true },
        }),
        prisma.monitorCheck.findMany({
          where: { websiteId: website.id, checkedAt: { gte: since7d } },
          select: { status: true },
        }),
      ]);
      uptime24h = calcUptimePercent(checks24h);
      uptime7d = calcUptimePercent(checks7d);
    }

    summaries.push({
      websiteId: website.id,
      name: website.name,
      domain: website.domain,
      monitorEnabled: website.monitorEnabled,
      monitorUrl,
      status: latest ? (latest.status as MonitorStatus) : "unknown",
      responseMs: latest?.responseMs ?? null,
      statusCode: latest?.statusCode ?? null,
      uptime24h,
      uptime7d,
      sslValid: latest?.sslValid ?? null,
      sslDaysLeft: latest?.sslDaysLeft ?? null,
      sslExpiresAt: latest?.sslExpiresAt?.toISOString() ?? null,
      sslIssuer: latest?.sslIssuer ?? null,
      sslHealth: getSslHealth(latest?.sslDaysLeft, latest?.sslValid),
      lastCheckedAt: latest?.checkedAt.toISOString() ?? null,
      error: latest?.error ?? null,
    });
  }

  return summaries;
}

export async function getMonitorDetail(userId: string, websiteId: string, range: MonitorRange = "7d") {
  const website = await prisma.website.findFirst({
    where: { id: websiteId, userId },
    select: {
      id: true,
      name: true,
      domain: true,
      monitorEnabled: true,
      monitorUrl: true,
      trackingId: true,
    },
  });

  if (!website) return null;

  const since = getMonitorRangeStart(range);
  const checks = await prisma.monitorCheck.findMany({
    where: { websiteId: website.id, checkedAt: { gte: since } },
    orderBy: { checkedAt: "asc" },
  });

  const latest = checks[checks.length - 1] ?? null;
  const monitorUrl = buildMonitorUrl(website.domain, website.monitorUrl);

  return {
    website: {
      ...website,
      monitorUrl,
    },
    range,
    summary: {
      uptime: calcUptimePercent(checks),
      avgResponseMs: avgResponseMs(checks),
      totalChecks: checks.length,
      status: latest ? (latest.status as MonitorStatus) : "unknown",
      sslValid: latest?.sslValid ?? null,
      sslDaysLeft: latest?.sslDaysLeft ?? null,
      sslExpiresAt: latest?.sslExpiresAt?.toISOString() ?? null,
      sslIssuer: latest?.sslIssuer ?? null,
      sslHealth: getSslHealth(latest?.sslDaysLeft, latest?.sslValid),
      lastCheckedAt: latest?.checkedAt.toISOString() ?? null,
      error: latest?.error ?? null,
    },
    checks: checks.map((check) => ({
      id: check.id,
      status: check.status,
      responseMs: check.responseMs,
      statusCode: check.statusCode,
      sslValid: check.sslValid,
      sslDaysLeft: check.sslDaysLeft,
      sslExpiresAt: check.sslExpiresAt?.toISOString() ?? null,
      error: check.error,
      checkedAt: check.checkedAt.toISOString(),
    })),
  };
}

export async function getMonitorOverview(userId: string) {
  const summaries = await getMonitorSummaries(userId);
  const enabled = summaries.filter((item) => item.monitorEnabled);
  const up = enabled.filter((item) => item.status === "up").length;
  const down = enabled.filter((item) => item.status === "down").length;
  const sslWarning = enabled.filter(
    (item) => item.sslHealth === "warning" || item.sslHealth === "critical" || item.sslHealth === "invalid",
  ).length;

  const uptimeValues = enabled
    .map((item) => item.uptime24h)
    .filter((value): value is number => value !== null);
  const avgUptime24h =
    uptimeValues.length === 0
      ? null
      : Number((uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length).toFixed(2));

  return {
    totals: {
      total: summaries.length,
      monitored: enabled.length,
      up,
      down,
      sslWarning,
      avgUptime24h,
    },
    monitors: summaries,
  };
}
