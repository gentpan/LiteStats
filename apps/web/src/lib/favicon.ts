export function normalizeSiteDomain(domain: string) {
  const trimmed = domain.trim();
  if (!trimmed) return "";

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      ?.split(":")[0]
      ?.trim() ?? trimmed;
  }
}

export function getFaviconUrl(domain: string) {
  const host = normalizeSiteDomain(domain);
  if (!host) return null;

  const base = (process.env.NEXT_PUBLIC_FAVICON_BASE_URL ?? "https://favicon.la").replace(/\/$/, "");
  return `${base}/${host}`;
}
