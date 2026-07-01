import { createHash } from "node:crypto";

export function hashVisitorId(ip: string, userAgent: string, websiteId: string) {
  const salt = process.env.HASH_SALT ?? "litestats-dev-salt";
  return createHash("sha256")
    .update(`${salt}:${websiteId}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

export function hashIp(ip: string) {
  const salt = process.env.HASH_SALT ?? "litestats-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
