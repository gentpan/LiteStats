import type { PoolClient } from "pg"
import { domainToUnicode } from "node:url"

export const canonicalDomainSql = "regexp_replace(rtrim(regexp_replace(lower(domain), ':[0-9]+$', ''), '.'), '^www[.]', '')"

type DomainClient = Pick<PoolClient, "query" | "release">
type DomainPool = { connect(): Promise<DomainClient> }

export function normalizeDomain(value: string) {
  try {
    const input = value.trim()
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`)
    const domain = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
    if (!domain || url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error()
    return domain
  } catch {
    throw new Error("请填写有效域名")
  }
}

export function domainAliases(value: string) {
  const canonical = normalizeDomain(value)
  return [...new Set([canonical, domainToUnicode(canonical)].filter(Boolean))]
}

/** Serialize domain claims without changing indexes or any historical ownership records. */
export async function withSiteDomain<T>(
  pool: DomainPool,
  input: string | undefined,
  siteId: number | null,
  write: (client: DomainClient, domain: string, previousDomain: string | null) => Promise<T>,
): Promise<T> {
  const requested = input === undefined ? undefined : normalizeDomain(input)
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const current = siteId === null ? null : (await client.query<{domain: string}>("SELECT domain FROM sites WHERE id = $1 FOR UPDATE", [siteId])).rows[0]
    if (siteId !== null && !current) throw new Error("站点不存在")
    const domain = current && (requested === undefined || normalizeDomain(current.domain) === requested)
      ? current.domain : requested
    if (!domain) throw new Error("请填写有效域名")
    if (!current || domain !== current.domain) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", ["litestats-site-domain", normalizeDomain(domain)])
      const duplicate = await client.query<{id: number}>(
        `SELECT id FROM sites WHERE ${canonicalDomainSql} = ANY($1::text[]) AND COALESCE(consolidated, false) = false AND ($2::bigint IS NULL OR id <> $2) LIMIT 1`,
        [domainAliases(domain), siteId],
      )
      if (duplicate.rows.length) throw new Error("这个域名已经添加，请使用其他域名")
    }
    const result = await write(client, domain, current?.domain ?? null)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
