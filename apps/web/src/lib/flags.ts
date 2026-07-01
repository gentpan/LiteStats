export type FlagRatio = "1x1" | "4x3";

function getFlagBaseUrl() {
  return (process.env.NEXT_PUBLIC_FLAG_BASE_URL ?? "/flags").replace(/\/$/, "");
}

export function getFlagUrl(
  countryCode: string | null | undefined,
  ratio: FlagRatio = "4x3",
) {
  if (!countryCode) return null;

  const code = countryCode.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;

  const base = getFlagBaseUrl();
  if (base.includes("flagcdn.io")) {
    return `${base}/${code}.svg`;
  }

  return `${base}/${ratio}/${code}.svg`;
}

const regionNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });

export function getCountryLabel(countryCode: string | null | undefined, fallback?: string | null) {
  if (fallback?.trim()) return fallback.trim();
  if (!countryCode) return "未知";

  try {
    return regionNames.of(countryCode.toUpperCase()) ?? countryCode.toUpperCase();
  } catch {
    return countryCode.toUpperCase();
  }
}
