import assert from "node:assert/strict"
import pg from "pg"

const source = new URL(process.env.LITESTATS_TEST_DATABASE_URL || "")
assert.equal(source.hostname, "127.0.0.1")
assert.equal(source.username, "litestats_test")
assert.equal(source.pathname, "/litestats_retired_test")
assert.ok(!["5432", "5435", "55435"].includes(source.port), "Use a disposable cluster")
const probe = new pg.Pool({connectionString: source.href})
assert.equal((await probe.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.length, 0, "Refusing any existing application database")

// Model older schemas and opaque stored credentials. Application startup must not upgrade or read them.
await probe.query(`
  CREATE TABLE litestats_channels (channel text PRIMARY KEY, encrypted text NOT NULL, verified_at timestamptz);
  INSERT INTO litestats_channels VALUES ('smtp', 'FIXTURE_LEGACY_OPAQUE', '2020-01-01T00:00:00Z');
  CREATE TABLE site_map_settings (site_id bigint PRIMARY KEY, provider text CHECK (provider IN ('default', 'google')), api_key text);
  INSERT INTO site_map_settings VALUES (999, 'google', 'FIXTURE_LEGACY_MAP_KEY');
  CREATE TABLE api_keys (id bigserial PRIMARY KEY, user_id bigint, name text, key_prefix text, key_hash text, scopes text[]);
  INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES (999, 'Legacy', 'fixture', 'FIXTURE_LEGACY_HASH', '{stats:read:*}');
`)
async function snapshot(pool: pg.Pool) {
  const rows = []
  for (const table of ["litestats_channels", "site_map_settings", "api_keys"]) {
    rows.push((await pool.query(`SELECT row_to_json(t)::text AS value FROM ${table} AS t`)).rows)
    rows.push((await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position", [table])).rows)
    rows.push((await pool.query("SELECT pg_get_constraintdef(oid) AS value FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname", [table])).rows)
  }
  return rows
}
const before = await snapshot(probe)
process.env.DATABASE_URL = source.href
process.env.SEED_DEMO = "false"
const {db, createUser, createSite, updateSite, findSiteForUser, createSharedLink, findSharedLink, eventSession} = await import("../src/lib/db")
const pool = await db()
try {
  const owner = await createUser("owner@retired-fixture.invalid", "fixture-password", "Owner")
  const viewer = await createUser("viewer@retired-fixture.invalid", "fixture-password", "Viewer")
  const site = await createSite(owner.id, "retired-fixture.test", "UTC")
  await pool.query("INSERT INTO team_memberships(user_id,team_id,role) VALUES($1,$2,'viewer')", [viewer.id, site.team_id])
  assert.ok(await findSiteForUser(viewer.id, site.domain))
  assert.equal(await findSiteForUser(viewer.id, site.domain, "admin"), null)
  await updateSite(site.id, {name: "Updated", public: true})
  const share = await createSharedLink(site.id, "Fixture share")
  assert.equal((await findSharedLink(share.slug))?.site.id, site.id)
  assert.ok(await eventSession("retired-fixture-visitor"))
  assert.deepEqual(await snapshot(pool), before)
  console.log("PASS: core accounts, permissions, sites, sharing and event sessions preserve retired settings rows, columns and constraints exactly")
} finally {
  await pool.end()
  await probe.end()
}
