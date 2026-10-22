import assert from "node:assert/strict"
import pg from "pg"

// This runner requires a newly initialized, disposable local cluster, never an app database.
const source = new URL(process.env.LITESTATS_TEST_DATABASE_URL || "")
assert.equal(source.hostname, "127.0.0.1")
assert.equal(source.username, "litestats_test")
assert.equal(source.pathname, "/litestats_domain_test")
assert.notEqual(source.port, "55435")
assert.notEqual(source.port, "5435")
process.env.DATABASE_URL = source.href
process.env.SEED_DEMO = "false"
const probe = new pg.Pool({connectionString: source.href})
const tables = await probe.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")
assert.equal(tables.rows.length, 0, "Refusing a database that already contains tables")
await probe.end()

const {db, createUser, createSite, updateSite, findSiteByDomain, findSiteForUser, findSharedLink, createSharedLink} = await import("../src/lib/db")
const pool = await db()
try {
  const alice = await createUser("alice@test.invalid", "test-password", "Alice")
  const bob = await createUser("bob@test.invalid", "test-password", "Bob")
  const site = await createSite(alice.id, "https://www.EXAMPLE.test/path", "UTC", "Original")
  assert.equal(site.domain, "example.test")
  const share = await createSharedLink(site.id, "Existing share")
  await assert.rejects(createSite(alice.id, "invalid-zone.test", "Invalid/Zone"), /有效的时区/)
  assert.equal(await findSiteByDomain("invalid-zone.test"), null)
  await assert.rejects(updateSite(site.id, {name: "Must not save", timezone: "Invalid/Zone"}), /有效的时区/)
  assert.equal((await findSiteForUser(alice.id, site.domain))?.name, "Original")
  assert.equal((await findSiteForUser(alice.id, site.domain))?.timezone, "UTC")
  const zoned = await createSite(alice.id, "valid-zone.test", " asia/shanghai ")
  assert.equal(zoned.timezone, "Asia/Shanghai")
  await updateSite(zoned.id, {timezone: "US/Eastern"})
  // ICU versions may preserve a supported alias or return its primary name.
  assert.ok(["US/Eastern", "America/New_York"].includes((await findSiteForUser(alice.id, zoned.domain))!.timezone))
  // Simulate an old invalid setting in this disposable fixture, never a user database.
  await pool.query("UPDATE sites SET timezone='Invalid/Zone' WHERE id=$1", [zoned.id])
  const legacyShare = await createSharedLink(zoned.id, "Legacy timezone")
  await updateSite(zoned.id, {public: true})
  assert.equal((await findSiteByDomain(zoned.domain))?.timezone, "Invalid/Zone")
  assert.equal((await findSharedLink(legacyShare.slug))?.site.timezone, "Invalid/Zone")
  console.log("PASS: invalid timezone writes rejected atomically, aliases normalized, unrelated settings and sharing preserve the stored legacy timezone")
  await assert.rejects(createSite(bob.id, "EXAMPLE.test", "UTC"), /域名已经添加/)
  const results = await Promise.allSettled([
    createSite(alice.id, "concurrent.test", "UTC"),
    createSite(bob.id, "www.CONCURRENT.test", "UTC"),
  ])
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
  assert.equal(results.filter(result => result.status === "rejected").length, 1)

  await assert.rejects(updateSite(site.id, {domain: "concurrent.test", name: "Should roll back", timezone: "Asia/Shanghai"}), /域名已经添加/)
  const unchanged = await findSiteForUser(alice.id, site.domain)
  assert.equal(unchanged?.name, "Original")
  assert.equal(unchanged?.timezone, "UTC")
  assert.equal(await findSiteForUser(bob.id, site.domain), null)
  await pool.query("INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1, $2, 'viewer')", [bob.id, site.team_id])
  assert.ok(await findSiteForUser(bob.id, site.domain))
  assert.equal(await findSiteForUser(bob.id, site.domain, "admin"), null)
  assert.equal(await findSiteForUser(bob.id, site.domain, "write"), null)

  // Model historical duplicate rows: retain both records and allow an ordinary settings save.
  await pool.query("INSERT INTO sites (domain, team_id) VALUES ($1, $2)", [site.domain, site.team_id])
  await updateSite(site.id, {domain: site.domain, name: "Updated"})
  assert.equal((await pool.query("SELECT count(*) FROM sites WHERE domain=$1", [site.domain])).rows[0].count, 2)
  assert.equal((await findSiteByDomain(site.domain))?.id, site.id)
  assert.equal((await findSharedLink(share.slug))?.site.id, site.id)

  const legacy = await pool.query<{id: number}>("INSERT INTO sites (domain, team_id) VALUES ($1, $2) RETURNING id", ["例子.测试", site.team_id])
  await assert.rejects(createSite(bob.id, "xn--fsqu00a.xn--0zwm56d", "UTC"), /域名已经添加/)
  assert.equal((await findSiteByDomain("xn--fsqu00a.xn--0zwm56d"))?.id, legacy.rows[0].id)
  assert.equal(await updateSite(legacy.rows[0].id, {domain: "例子.测试", name: "Keep legacy domain"}), "例子.测试")
  const portSite = await pool.query<{id: number}>("INSERT INTO sites (domain, team_id) VALUES ($1, $2) RETURNING id", ["legacy.test:8443", site.team_id])
  await assert.rejects(createSite(bob.id, "legacy.test", "UTC"), /域名已经添加/)
  assert.equal(await updateSite(portSite.rows[0].id, {domain: "legacy.test:8443", name: "Keep legacy port"}), "legacy.test:8443")
  const baseSite = await pool.query<{id: number}>("INSERT INTO sites (domain, team_id) VALUES ($1, $2) RETURNING id", ["legacy.test", site.team_id])
  assert.equal((await findSiteByDomain("legacy.test:8443"))?.id, portSite.rows[0].id)
  assert.equal((await findSiteByDomain("legacy.test"))?.id, baseSite.rows[0].id)

  assert.equal(await findSiteByDomain("cached.test"), null)
  const cached = await createSite(alice.id, "cached.test", "UTC")
  assert.equal((await findSiteByDomain("cached.test"))?.id, cached.id)
  await updateSite(cached.id, {domain: "renamed.test"})
  assert.equal(await findSiteByDomain("cached.test"), null)
  assert.equal((await findSiteByDomain("renamed.test"))?.id, cached.id)
  console.log("PASS: normalization, duplicate rejection, concurrent claims, atomic settings rollback, read/write permissions, historical duplicates/Unicode/ports, sharing and cache invalidation")
} finally {
  await pool.end()
}
