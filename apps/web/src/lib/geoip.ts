import { hashIp } from "@/lib/hash";

export type GeoIpResult = {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
};

type GeoIpApiResponse = {
  country_code?: string;
  country?: string;
  region?: string;
  province?: string;
  city?: string;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { value: GeoIpResult | null; expiresAt: number }>();

function getGeoIpBaseUrl() {
  return (process.env.GEOIP_API_URL ?? "https://api.cnip.io/geoip").replace(/\/$/, "");
}

export function isPrivateIp(ip: string) {
  if (!ip || ip === "unknown") return true;
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }

  if (ip.includes(":")) {
    return false;
  }

  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function normalizeCountryCode(code: string | undefined) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export async function lookupGeoIp(ip: string): Promise<GeoIpResult | null> {
  if (isPrivateIp(ip)) {
    return null;
  }

  const cacheKey = hashIp(ip);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const response = await fetch(`${getGeoIpBaseUrl()}/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      cache.set(cacheKey, { value: null, expiresAt: Date.now() + 5 * 60 * 1000 });
      return null;
    }

    const data = (await response.json()) as GeoIpApiResponse;
    const result: GeoIpResult = {
      countryCode: normalizeCountryCode(data.country_code),
      country: data.country?.trim() || null,
      region: data.region?.trim() || data.province?.trim() || null,
      city: data.city?.trim() || null,
    };

    cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    cache.set(cacheKey, { value: null, expiresAt: Date.now() + 5 * 60 * 1000 });
    return null;
  }
}
