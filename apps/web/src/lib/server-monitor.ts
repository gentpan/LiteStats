import { prisma } from "@/lib/db";

const STALE_MS = 5 * 60 * 1000;
const METRIC_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type ServerRange = "24h" | "7d" | "30d";

const RANGE_MS: Record<ServerRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function getServerRangeStart(range: ServerRange) {
  return new Date(Date.now() - RANGE_MS[range]);
}

export function isServerOnline(lastReportedAt: Date | null | undefined) {
  if (!lastReportedAt) return false;
  return Date.now() - lastReportedAt.getTime() < STALE_MS;
}

export async function recordServerMetrics(
  agentToken: string,
  data: {
    cpuPercent?: number;
    memUsed?: number;
    memTotal?: number;
    diskUsed?: number;
    diskTotal?: number;
    load1?: number;
    uptimeSec?: number;
  },
) {
  const server = await prisma.server.findUnique({
    where: { agentToken },
    select: { id: true },
  });

  if (!server) return null;

  return prisma.serverMetric.create({
    data: {
      serverId: server.id,
      cpuPercent: data.cpuPercent,
      memUsed: data.memUsed != null ? BigInt(data.memUsed) : null,
      memTotal: data.memTotal != null ? BigInt(data.memTotal) : null,
      diskUsed: data.diskUsed != null ? BigInt(data.diskUsed) : null,
      diskTotal: data.diskTotal != null ? BigInt(data.diskTotal) : null,
      load1: data.load1,
      uptimeSec: data.uptimeSec != null ? BigInt(data.uptimeSec) : null,
    },
  });
}

export async function getServerSummaries(userId: string) {
  const servers = await prisma.server.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      metrics: {
        orderBy: { reportedAt: "desc" },
        take: 1,
      },
    },
  });

  return servers.map((server) => {
    const latest = server.metrics[0];
    const online = isServerOnline(latest?.reportedAt);
    const memPercent =
      latest?.memUsed != null && latest.memTotal != null && latest.memTotal > BigInt(0)
        ? Number(((latest.memUsed * BigInt(100)) / latest.memTotal).toString())
        : null;
    const diskPercent =
      latest?.diskUsed != null && latest.diskTotal != null && latest.diskTotal > BigInt(0)
        ? Number(((latest.diskUsed * BigInt(100)) / latest.diskTotal).toString())
        : null;

    return {
      id: server.id,
      name: server.name,
      hostname: server.hostname,
      online,
      cpuPercent: latest?.cpuPercent ?? null,
      memPercent,
      diskPercent,
      load1: latest?.load1 ?? null,
      uptimeSec: latest?.uptimeSec != null ? Number(latest.uptimeSec) : null,
      lastReportedAt: latest?.reportedAt.toISOString() ?? null,
    };
  });
}

export async function getServerDetail(userId: string, serverId: string, range: ServerRange = "24h") {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: {
      id: true,
      name: true,
      hostname: true,
      agentToken: true,
      createdAt: true,
    },
  });

  if (!server) return null;

  const since = getServerRangeStart(range);
  const metrics = await prisma.serverMetric.findMany({
    where: { serverId: server.id, reportedAt: { gte: since } },
    orderBy: { reportedAt: "asc" },
  });

  const latest = metrics[metrics.length - 1] ?? null;

  return {
    server: {
      id: server.id,
      name: server.name,
      hostname: server.hostname,
      agentToken: server.agentToken,
      createdAt: server.createdAt.toISOString(),
    },
    range,
    online: isServerOnline(latest?.reportedAt),
    metrics: metrics.map((metric) => ({
      id: metric.id,
      cpuPercent: metric.cpuPercent,
      memUsed: metric.memUsed != null ? Number(metric.memUsed) : null,
      memTotal: metric.memTotal != null ? Number(metric.memTotal) : null,
      diskUsed: metric.diskUsed != null ? Number(metric.diskUsed) : null,
      diskTotal: metric.diskTotal != null ? Number(metric.diskTotal) : null,
      load1: metric.load1,
      uptimeSec: metric.uptimeSec != null ? Number(metric.uptimeSec) : null,
      reportedAt: metric.reportedAt.toISOString(),
    })),
    latest: latest
      ? {
          cpuPercent: latest.cpuPercent,
          memUsed: latest.memUsed != null ? Number(latest.memUsed) : null,
          memTotal: latest.memTotal != null ? Number(latest.memTotal) : null,
          diskUsed: latest.diskUsed != null ? Number(latest.diskUsed) : null,
          diskTotal: latest.diskTotal != null ? Number(latest.diskTotal) : null,
          load1: latest.load1,
          uptimeSec: latest.uptimeSec != null ? Number(latest.uptimeSec) : null,
          reportedAt: latest.reportedAt.toISOString(),
        }
      : null,
  };
}

export async function pruneOldServerMetrics() {
  const cutoff = new Date(Date.now() - METRIC_RETENTION_MS);
  return prisma.serverMetric.deleteMany({
    where: { reportedAt: { lt: cutoff } },
  });
}
