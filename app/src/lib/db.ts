import { canonicalDomainSql, domainAliases, withSiteDomain } from "./site-domain"
import { timezoneSchema } from "./validation"
import pg from "pg"
import bcrypt from "bcryptjs"
import { DATABASE_URL, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, SEED_DEMO } from "./env"
import { createInstanceSetupStore, InstanceAlreadyInitializedError } from "./instance-setup"

pg.types.setTypeParser(20, value => {
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw new Error("数据库整数超过 JavaScript 安全范围")
  return id
})
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 })

let ready: Promise<void> | null = null

export type User = {
  id: number
  email: string
  type?: string
  session_version?: number
  email_verified?: boolean
  name: string
  theme?: string
  totp_enabled?: boolean
  avatar?: string | null
  locale?: string
}
export type Passkey = { id: number, name: string, credential_id: string, inserted_at: string }
export type Site = {
  role?: string
  id: number
  domain: string
  name: string | null
  timezone: string
  allowed_event_props: string[] | null
  team_id: number | null
  public: boolean
}
export type SharedLink = { id: number, name: string, slug: string }

export async function db() {
  if (!ready) ready = ensureAdmin().catch(error => { ready = null; throw error })
  await ready
  return pool
}

async function ensureSchema() {
  // Retained only for compatibility with historical backups.
  await pool.query(`CREATE TABLE IF NOT EXISTS litestats_channels (
    channel text PRIMARY KEY, encrypted text NOT NULL, verified_at timestamptz
  )`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id bigserial PRIMARY KEY,
      email varchar(255) NOT NULL UNIQUE,
      name varchar(255) NOT NULL DEFAULT '',
      password_hash varchar(255),
      email_verified boolean NOT NULL DEFAULT false,
      theme varchar(16) NOT NULL DEFAULT 'system',
      type varchar(32) NOT NULL DEFAULT 'standard',
      avatar text,
      locale varchar(16) NOT NULL DEFAULT 'zh-CN',
      totp_enabled boolean NOT NULL DEFAULT false,
      totp_secret text,
      totp_token varchar(64),
      totp_last_used_at timestamptz,
      previous_email varchar(255),
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS type varchar(32) NOT NULL DEFAULT 'standard'`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locale varchar(16)`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_token varchar(64)`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_used_at timestamptz`)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_email varchar(255)`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id bigserial PRIMARY KEY,
      name varchar(255) NOT NULL,
      trial_expiry_date date,
      accept_traffic_until date,
      allow_next_upgrade_override boolean NOT NULL DEFAULT false,
      setup_complete boolean NOT NULL DEFAULT false,
      setup_at timestamp(0) without time zone,
      hourly_api_request_limit integer NOT NULL DEFAULT 600,
      locked boolean NOT NULL DEFAULT false,
      policy jsonb NOT NULL DEFAULT '{}'::jsonb,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_memberships (
      id bigserial PRIMARY KEY,
      role varchar(32) NOT NULL,
      user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      is_autocreated boolean NOT NULL DEFAULT false,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      UNIQUE (team_id, user_id)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_invitations (
      id bigserial PRIMARY KEY,
      invitation_id varchar(64) NOT NULL,
      email varchar(255) NOT NULL,
      role varchar(32) NOT NULL,
      inviter_id bigint REFERENCES users(id) ON DELETE SET NULL,
      team_id bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      UNIQUE (team_id, email)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sites (
      id bigserial PRIMARY KEY,
      domain varchar(255) NOT NULL,
      name varchar(255),
      timezone varchar(64) NOT NULL DEFAULT 'Etc/UTC',
      team_id bigint REFERENCES teams(id) ON DELETE SET NULL,
      public boolean NOT NULL DEFAULT false,
      conversions_enabled boolean NOT NULL DEFAULT true,
      props_enabled boolean NOT NULL DEFAULT true,
      funnels_enabled boolean NOT NULL DEFAULT true,
      consolidated boolean NOT NULL DEFAULT false,
      ingest_rate_limit_scale_seconds integer NOT NULL DEFAULT 60,
      onboarding_status varchar(32) NOT NULL DEFAULT 'completed',
      allowed_event_props text[],
      domain_changed_from varchar(255),
      domain_changed_at timestamp(0) without time zone,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  // Storage-only legacy schema keeps old backups restorable; no configuration is read or changed.
  await pool.query(`CREATE TABLE IF NOT EXISTS site_map_settings (
    site_id bigint PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'default' CHECK (provider IN ('default', 'google', 'mapbox')),
    api_key text NOT NULL DEFAULT '',
    google_style text NOT NULL DEFAULT 'auto',
    mapbox_token text NOT NULL DEFAULT '',
    mapbox_style text NOT NULL DEFAULT 'auto',
    mapbox_custom_style text NOT NULL DEFAULT ''
  )`)

  await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS name varchar(255)`)
  await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS allowed_event_props text[]`)
  await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS domain_changed_from varchar(255)`)
  await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS domain_changed_at timestamp(0) without time zone`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      display_name varchar(255) NOT NULL,
      event_name varchar(255),
      page_path varchar(255),
      scroll_threshold integer NOT NULL DEFAULT -1,
      custom_props jsonb NOT NULL DEFAULT '{}'::jsonb,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funnels (
      id bigserial PRIMARY KEY,
      name varchar(255) NOT NULL,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funnel_steps (
      id bigserial PRIMARY KEY,
      funnel_id bigint NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
      goal_id bigint NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      step_order integer NOT NULL,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shared_links (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name varchar(255) NOT NULL,
      slug varchar(64) NOT NULL UNIQUE,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guest_memberships (
      id bigserial PRIMARY KEY,
      team_membership_id bigint NOT NULL REFERENCES team_memberships(id) ON DELETE CASCADE,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guest_invitations (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE
    )
  `)
  // Retained only for compatibility with historical backups.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id bigserial PRIMARY KEY,
      user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(255) NOT NULL,
      key_prefix varchar(32) NOT NULL,
      key_hash varchar(255) NOT NULL,
      scopes text[] NOT NULL DEFAULT '{}',
      hourly_request_limit integer NOT NULL DEFAULT 600,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS totp_recovery_codes (
      id bigserial PRIMARY KEY,
      code_digest text NOT NULL,
      user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_passkeys (
      id bigserial PRIMARY KEY,
      user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id text NOT NULL UNIQUE,
      public_key text NOT NULL,
      counter bigint NOT NULL DEFAULT 0,
      transports text,
      name varchar(255),
      inserted_at timestamp(0) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(0) without time zone NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_auth (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      email varchar(255) NOT NULL DEFAULT '',
      property varchar(255),
      refresh_token text NOT NULL DEFAULT '',
      access_token text NOT NULL DEFAULT '',
      expires timestamptz
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bing_auth (
      id bigserial PRIMARY KEY,
      site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      api_key text NOT NULL DEFAULT '',
      site_url text
    )
  `)
  await pool.query(`ALTER TABLE google_auth ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES users(id) ON DELETE SET NULL`)
  for (const table of ["google_auth", "bing_auth"]) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS inserted_at timestamptz NOT NULL DEFAULT now()`)
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_site_id_unique ON ${table}(site_id)`)
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS event_sessions (identity text PRIMARY KEY, session_id text NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now())`)

}

async function ensureAdmin() {
  await ensureSchema()
  if (!SEED_DEMO) return
  try {
    // Seed only an empty development instance through the same lock as setup.
    await createInstanceSetupStore(async () => pool).create({email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD, name: "Demo Admin"})
  } catch (error) {
    if (!(error instanceof InstanceAlreadyInitializedError)) throw error
  }
}

export async function findUserByEmail(email: string) {
  const res = await (await db()).query<User & { password_hash: string }>(
    `SELECT id, email, name, COALESCE(type, 'standard') AS type, COALESCE(password_hash, '') AS password_hash,
            COALESCE(totp_enabled, false) AS totp_enabled,
            COALESCE(avatar, '') AS avatar, COALESCE(locale, 'zh-CN') AS locale
     FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  )
  return res.rows[0] || null
}

export async function findUserById(id: number) {
  const res = await (await db()).query<User>(
    `SELECT id, email, email_verified, session_version, name, COALESCE(type, 'standard') AS type, COALESCE(theme, 'system') AS theme, COALESCE(totp_enabled, false) AS totp_enabled,
            COALESCE(avatar, '') AS avatar, COALESCE(locale, 'zh-CN') AS locale
     FROM users WHERE id = $1`,
    [id],
  )
  return res.rows[0] || null
}

export async function listSites(userId: number) {
  const res = await (await db()).query<Site>(
    `SELECT DISTINCT s.id, s.domain, s.name, COALESCE(s.timezone, 'Etc/UTC') AS timezone, s.allowed_event_props, s.team_id, COALESCE(s.public, false) AS public
     FROM sites s
     JOIN team_memberships tm ON tm.team_id = s.team_id
     WHERE tm.user_id = $1 AND COALESCE(s.consolidated, false) = false
       AND (tm.role <> 'guest' OR EXISTS (
         SELECT 1 FROM guest_memberships gm WHERE gm.team_membership_id = tm.id AND gm.site_id = s.id
       ))
     ORDER BY s.domain`,
    [userId],
  )
  return res.rows
}

export async function findSiteForUser(userId: number, domain: string, access: "read" | "write" | "admin" = "read") {
  const res = await (await db()).query<Site>(
    `SELECT s.id, s.domain, s.name, COALESCE(s.timezone, 'Etc/UTC') AS timezone, s.allowed_event_props, s.team_id, COALESCE(s.public, false) AS public, tm.role AS role
     FROM sites s
     JOIN team_memberships tm ON tm.team_id = s.team_id
     WHERE tm.user_id = $1 AND s.domain = $2 AND COALESCE(s.consolidated, false) = false
       AND (tm.role <> 'guest' OR EXISTS (
         SELECT 1 FROM guest_memberships gm WHERE gm.team_membership_id = tm.id AND gm.site_id = s.id
       ))
       AND ($3 = 'read' OR (tm.role IN ('owner', 'admin')) OR ($3 = 'write' AND tm.role = 'editor'))
     LIMIT 1`,
    [userId, domain, access],
  )
  return res.rows[0] || null
}

export async function findSiteById(id: number) {
  const res = await (await db()).query<Site>(
    `SELECT id, domain, name, COALESCE(timezone, 'Etc/UTC') AS timezone, allowed_event_props, team_id, COALESCE(public, false) AS public
     FROM sites WHERE id = $1 LIMIT 1`,
    [id],
  )
  return res.rows[0] || null
}

const SITE_CACHE_TTL_MS = 60_000
const siteCache = new Map<string, { site: Site | null, expiresAt: number }>()

export function invalidateSiteCache() {
  // A changed site can have legacy Unicode, www or port aliases cached under other keys.
  siteCache.clear()
}

export async function findSiteByDomain(domain: string) {
  let aliases: string[]
  try { aliases = domainAliases(domain) } catch { return null }
  const key = domain.trim().toLowerCase()
  const cached = siteCache.get(key)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.site
  }

  const res = await (await db()).query<Site>(
    `SELECT id, domain, name, COALESCE(timezone, 'Etc/UTC') AS timezone, allowed_event_props, team_id, COALESCE(public, false) AS public
     FROM sites WHERE ${canonicalDomainSql} = ANY($1::text[]) AND COALESCE(consolidated, false) = false
     ORDER BY (lower(domain) = $2) DESC, id LIMIT 1`,
    [aliases, key],
  )
  const site = res.rows[0] || null
  siteCache.set(key, { site, expiresAt: now + SITE_CACHE_TTL_MS })
  return site
}

export async function updateSite(siteId: number, patch: {
  name?: string | null
  timezone?: string
  allowed_event_props?: string[]
  public?: boolean
  domain?: string
}) {
  const timezone = patch.timezone === undefined ? undefined : timezoneSchema.parse(patch.timezone)
  const result = await withSiteDomain(await db(), patch.domain, siteId, async (client, domain, previousDomain) => {
    const sets: string[] = []
    const values: unknown[] = [siteId]
    const set = (column: string, value: unknown) => {
      values.push(value)
      sets.push(`${column} = $${values.length}`)
    }
    if (patch.name !== undefined) set("name", patch.name?.trim() || null)
    if (timezone !== undefined) set("timezone", timezone)
    if (patch.allowed_event_props) set("allowed_event_props", patch.allowed_event_props)
    if (patch.public != null) set("public", patch.public)
    if (domain !== previousDomain) {
      set("domain", domain)
      set("domain_changed_from", previousDomain)
      sets.push("domain_changed_at = now()")
    }
    if (sets.length) await client.query(`UPDATE sites SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, values)
    return {domain, previousDomain}
  })
  invalidateSiteCache()
  return result.domain
}

export async function findPublicSite(domain: string) {
  const res = await (await db()).query<Site>(
    `SELECT id, domain, name, COALESCE(timezone, 'Etc/UTC') AS timezone, allowed_event_props, team_id, public
     FROM sites WHERE domain = $1 AND public = true AND COALESCE(consolidated, false) = false LIMIT 1`,
    [domain],
  )
  return res.rows[0] || null
}

export async function listSharedLinks(siteId: number) {
  const res = await (await db()).query<SharedLink>(
    `SELECT id, name, slug FROM shared_links WHERE site_id = $1 ORDER BY id DESC`,
    [siteId],
  )
  return res.rows
}

export async function createSharedLink(siteId: number, name: string) {
  const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 16)
  const res = await (await db()).query<SharedLink>(
    `INSERT INTO shared_links (site_id, name, slug, inserted_at, updated_at)
     VALUES ($1, $2, $3, now(), now()) RETURNING id, name, slug`,
    [siteId, name.trim() || "公开报表", slug],
  )
  return res.rows[0]
}

export async function deleteSharedLink(siteId: number, id: number) {
  await (await db()).query(`DELETE FROM shared_links WHERE site_id = $1 AND id = $2`, [siteId, id])
}

export async function findSharedLink(slug: string) {
  const res = await (await db()).query<{
    link_id: number
    name: string
    slug: string
    id: number
    site_name: string | null
    domain: string
    timezone: string
    allowed_event_props: string[] | null
    team_id: number | null
    public: boolean
  }>(
    `SELECT sl.id AS link_id, sl.name, sl.slug, s.id, s.name AS site_name, s.domain, COALESCE(s.timezone, 'Etc/UTC') AS timezone,
            s.allowed_event_props, s.team_id, COALESCE(s.public, false) AS public
     FROM shared_links sl JOIN sites s ON s.id = sl.site_id
     WHERE sl.slug = $1 LIMIT 1`,
    [slug],
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    link: { id: row.link_id, name: row.name, slug: row.slug },
    site: { id: row.id, name: row.site_name, domain: row.domain, timezone: row.timezone, allowed_event_props: row.allowed_event_props, team_id: row.team_id, public: row.public },
  }
}

const instanceSetupStore = createInstanceSetupStore(db)

export async function instanceNeedsSetup() {
  return instanceSetupStore.needsSetup()
}

// Retained for old clients; this can only create the first instance administrator.
export async function createUser(email: string, password: string, name: string) {
  return instanceSetupStore.create({email, password, name})
}

export async function deleteSite(siteId: number) {
  // Site-owned relational tables use ON DELETE CASCADE.
  await (await db()).query(`DELETE FROM sites WHERE id = $1`, [siteId])
  invalidateSiteCache()
}

export async function updateUser(userId: number, patch: {
  name?: string
  password?: string
  oldPassword?: string
  email?: string
  theme?: string
  avatar?: string | null
  locale?: string
}) {
  if ((patch.password || patch.email) && !patch.oldPassword) throw new Error("请填写当前密码")
  if (patch.oldPassword || patch.email || patch.password) {
    const row = await (await db()).query<{ password_hash: string }>(`SELECT COALESCE(password_hash, '') AS password_hash FROM users WHERE id = $1`, [userId])
    if (patch.oldPassword != null && !(await bcrypt.compare(patch.oldPassword, row.rows[0]?.password_hash || ""))) {
      throw new Error("密码不正确")
    }
  }
  if (patch.name != null) {
    await (await db()).query(`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`, [userId, patch.name.trim() || "Admin"])
  }
  if (patch.theme) {
    const theme = ["system", "light", "dark"].includes(patch.theme) ? patch.theme : "system"
    await (await db()).query(`UPDATE users SET theme = $2, updated_at = now() WHERE id = $1`, [userId, theme])
  }
  if (patch.locale) {
    const locale = patch.locale === "en" ? "en" : "zh-CN"
    await (await db()).query(`UPDATE users SET locale = $2, updated_at = now() WHERE id = $1`, [userId, locale])
  }
  if (patch.avatar !== undefined) {
    await (await db()).query(`UPDATE users SET avatar = $2, updated_at = now() WHERE id = $1`, [userId, patch.avatar])
  }
  if (patch.email) {
    const email = patch.email.trim().toLowerCase()
    if (!email.includes("@")) throw new Error("邮箱不正确")
    const exists = await findUserByEmail(email)
    if (exists && exists.id !== userId) throw new Error("这个邮箱已经注册")
    await (await db()).query(`UPDATE users SET previous_email = email, email = $2, email_verified = false, session_version = session_version + 1, updated_at = now() WHERE id = $1`, [userId, email])
  }
  if (patch.password) {
    if (patch.password.length < 8) throw new Error("密码至少 8 位")
    const hash = await bcrypt.hash(patch.password, 10)
    await (await db()).query(`UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = now() WHERE id = $1`, [userId, hash])
  }
}

export async function createSite(userId: number, domain: string, timezone: string, name?: string | null) {
  const zone = timezoneSchema.parse(timezone)
  const site = await withSiteDomain(await db(), domain, null, async (client, clean) => {
    const team = await client.query<{ team_id: number }>(
      `SELECT team_id FROM team_memberships WHERE user_id = $1 AND role IN ('owner', 'admin', 'editor') ORDER BY id LIMIT 1`,
      [userId],
    )
    if (!team.rows[0]) throw new Error("无法找到账号的站点存储空间")
    const res = await client.query<Site>(
      `INSERT INTO sites (domain, name, timezone, team_id, public, conversions_enabled, props_enabled, funnels_enabled, consolidated, ingest_rate_limit_scale_seconds, onboarding_status, inserted_at, updated_at)
       VALUES ($1, $2, $3, $4, false, true, true, true, false, 60, 'completed', now(), now())
       RETURNING id, domain, name, timezone, allowed_event_props, team_id, public`,
      [clean, name?.trim() || null, zone, team.rows[0].team_id],
    )
    return res.rows[0]
  })
  invalidateSiteCache()
  return site
}

export async function verifyPassword(userId: number, password: string) {
  const row = await (await db()).query<{ password_hash: string }>(
    `SELECT COALESCE(password_hash, '') AS password_hash FROM users WHERE id = $1`,
    [userId],
  )
  return bcrypt.compare(password, row.rows[0]?.password_hash || "")
}

export async function getTotpState(userId: number) {
  const res = await (await db()).query<{
    totp_enabled: boolean
    totp_secret: Buffer | null
    totp_last_used_at: Date | null
    email: string
    email_verified: boolean
  }>(
    `SELECT COALESCE(totp_enabled, false) AS totp_enabled, totp_secret, totp_last_used_at, email, email_verified
     FROM users WHERE id = $1`,
    [userId],
  )
  return res.rows[0] || null
}

export async function saveTotpSecret(userId: number, secret: Buffer) {
  await (await db()).query(
    `UPDATE users SET totp_enabled = false, totp_secret = $2, totp_token = NULL, totp_last_used_at = NULL, updated_at = now()
     WHERE id = $1`,
    [userId, secret.toString("base64")],
  )
}

export async function enableTotp(userId: number, token: string) {
  await (await db()).query(
    `UPDATE users SET totp_enabled = true, totp_token = $2, updated_at = now() WHERE id = $1`,
    [userId, token],
  )
}

export async function disableTotp(userId: number) {
  const client = await (await db()).connect()
  await client.query("BEGIN")
  try {
    await client.query(`DELETE FROM totp_recovery_codes WHERE user_id = $1`, [userId])
    await client.query(
      `UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_token = NULL, totp_last_used_at = NULL, updated_at = now()
       WHERE id = $1`,
      [userId],
    )
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally { client.release() }
}

export async function bumpTotpLastUsed(userId: number, unix: number) {
  const result = await (await db()).query(
    `UPDATE users SET totp_last_used_at = to_timestamp($2), updated_at = now() WHERE id = $1 AND (totp_last_used_at IS NULL OR totp_last_used_at < to_timestamp($2))`,
    [userId, unix],
  )
  if (result.rowCount !== 1) throw new Error("验证码已使用，请等待下一个验证码")
}

export async function replaceRecoveryCodes(userId: number, hashes: string[]) {
  const client = await (await db()).connect()
  await client.query("BEGIN")
  try {
    await client.query(`DELETE FROM totp_recovery_codes WHERE user_id = $1`, [userId])
    for (const hash of hashes) {
      await client.query(
        `INSERT INTO totp_recovery_codes (code_digest, user_id, inserted_at) VALUES ($1, $2, now())`,
        [hash, userId],
      )
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally { client.release() }
}

export async function consumeRecoveryCode(userId: number, code: string) {
  const { matchRecoveryCode } = await import("./totp")
  const res = await (await db()).query<{ id: number, code_digest: Buffer }>(
    `SELECT id, code_digest FROM totp_recovery_codes WHERE user_id = $1`,
    [userId],
  )
  for (const row of res.rows) {
    const digest = Buffer.isBuffer(row.code_digest) ? row.code_digest.toString("utf8") : String(row.code_digest)
    if (await matchRecoveryCode(code, digest)) {
      const consumed = await (await db()).query(`DELETE FROM totp_recovery_codes WHERE id = $1 RETURNING id`, [row.id])
      return consumed.rowCount === 1
    }
  }
  return false
}

export async function hasConfiguredPasskeys() {
  const result = await (await db()).query<{enabled: boolean}>("SELECT EXISTS (SELECT 1 FROM user_passkeys) AS enabled")
  return result.rows[0]?.enabled === true
}

export async function listPasskeys(userId: number) {
  const res = await (await db()).query<Passkey>(
    `SELECT id, COALESCE(name, 'Passkey') AS name, credential_id, inserted_at::text
     FROM user_passkeys WHERE user_id = $1 ORDER BY id DESC`,
    [userId],
  )
  return res.rows
}

export async function listPasskeyRecords(userId?: number) {
  const res = await (await db()).query<{
    id: number
    user_id: number
    credential_id: string
    public_key: string
    counter: string
    transports: string | null
  }>(
    userId
      ? `SELECT id, user_id, credential_id, public_key, counter::text, transports FROM user_passkeys WHERE user_id = $1`
      : `SELECT id, user_id, credential_id, public_key, counter::text, transports FROM user_passkeys`,
    userId ? [userId] : [],
  )
  return res.rows
}

export async function findPasskeyByCredentialId(credentialId: string) {
  const res = await (await db()).query<{
    id: number
    user_id: number
    credential_id: string
    public_key: string
    counter: string
    transports: string | null
  }>(
    `SELECT id, user_id, credential_id, public_key, counter::text, transports FROM user_passkeys WHERE credential_id = $1 LIMIT 1`,
    [credentialId],
  )
  return res.rows[0] || null
}

export async function insertPasskey(input: {
  userId: number
  credentialId: string
  publicKey: string
  counter: number
  transports?: string[]
  name: string
}) {
  await (await db()).query(
    `INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, transports, name, inserted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
    [input.userId, input.credentialId, input.publicKey, input.counter, JSON.stringify(input.transports || []), input.name],
  )
}

export async function updatePasskeyCounter(id: number, counter: number) {
  await (await db()).query(`UPDATE user_passkeys SET counter = $2, updated_at = now() WHERE id = $1`, [id, counter])
}

export async function deletePasskey(userId: number, id: number) {
  await (await db()).query(`DELETE FROM user_passkeys WHERE user_id = $1 AND id = $2`, [userId, id])
}

export async function eventSession(identity: string) {
  const fresh = crypto.randomUUID()
  const result = await (await db()).query<{session_id: string}>(`
    INSERT INTO event_sessions (identity, session_id, last_seen_at) VALUES ($1, $2, now())
    ON CONFLICT (identity) DO UPDATE SET
      session_id = CASE WHEN event_sessions.last_seen_at < now() - interval '30 minutes' THEN EXCLUDED.session_id ELSE event_sessions.session_id END,
      last_seen_at = now() RETURNING session_id`, [identity, fresh])
  return result.rows[0].session_id
}
