import tls from "node:tls";
import { normalizeSiteDomain } from "@/lib/favicon";

export type MonitorStatus = "up" | "down";

export type UptimeCheckResult = {
  status: MonitorStatus;
  responseMs: number;
  statusCode?: number;
  error?: string;
};

export type SslCheckResult = {
  valid: boolean;
  expiresAt?: Date;
  daysLeft?: number;
  issuer?: string;
  error?: string;
};

export function buildMonitorUrl(domain: string, monitorUrl?: string | null) {
  if (monitorUrl?.trim()) {
    const trimmed = monitorUrl.trim();
    if (trimmed.includes("://")) return trimmed;
    return `https://${trimmed}`;
  }

  const host = normalizeSiteDomain(domain);
  return host ? `https://${host}` : "";
}

export function getHostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return normalizeSiteDomain(url);
  }
}

export async function checkUptime(url: string, timeoutMs = 12_000): Promise<UptimeCheckResult> {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "LiteStats-Monitor/1.0",
        Accept: "*/*",
      },
    });

    const responseMs = Date.now() - start;
    const up = response.status >= 200 && response.status < 400;

    return {
      status: up ? "up" : "down",
      responseMs,
      statusCode: response.status,
      error: up ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "down",
      responseMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

export function checkSslCertificate(hostname: string, port = 443): Promise<SslCheckResult> {
  return new Promise((resolve) => {
    if (!hostname) {
      resolve({ valid: false, error: "Invalid hostname" });
      return;
    }

    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: 12_000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || Object.keys(cert).length === 0 || !cert.valid_to) {
          resolve({ valid: false, error: "No certificate found" });
          return;
        }

        const expiresAt = new Date(cert.valid_to);
        const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const issuerRaw = cert.issuer?.O ?? cert.issuer?.CN;
        const issuer = Array.isArray(issuerRaw) ? issuerRaw[0] : issuerRaw;

        resolve({
          valid: expiresAt.getTime() > Date.now(),
          expiresAt,
          daysLeft,
          issuer,
        });
      },
    );

    socket.on("error", (error) => {
      resolve({ valid: false, error: error.message });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ valid: false, error: "SSL connection timeout" });
    });
  });
}

export async function runWebsiteMonitorCheck(params: {
  domain: string;
  monitorUrl?: string | null;
}) {
  const url = buildMonitorUrl(params.domain, params.monitorUrl);
  if (!url) {
    return {
      url: "",
      uptime: {
        status: "down" as MonitorStatus,
        responseMs: 0,
        error: "Invalid monitor URL",
      },
      ssl: { valid: false, error: "Invalid hostname" } as SslCheckResult,
    };
  }

  const hostname = getHostnameFromUrl(url);
  const isHttps = url.startsWith("https://");

  const [uptime, ssl] = await Promise.all([
    checkUptime(url),
    isHttps
      ? checkSslCertificate(hostname)
      : Promise.resolve<SslCheckResult>({ valid: false, error: "HTTP only (no SSL)" }),
  ]);

  return { url, uptime, ssl };
}

export type SslHealth = "ok" | "warning" | "critical" | "invalid" | "none";

export function getSslHealth(daysLeft?: number | null, valid?: boolean | null): SslHealth {
  if (valid === null || valid === undefined) return "none";
  if (!valid || daysLeft === undefined || daysLeft === null) return "invalid";
  if (daysLeft <= 7) return "critical";
  if (daysLeft <= 30) return "warning";
  return "ok";
}
