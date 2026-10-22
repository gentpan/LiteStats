import assert from "node:assert/strict"
import pg from "pg"

const source = new URL(process.env.LITESTATS_TEST_DATABASE_URL || "")
assert.equal(source.hostname, "127.0.0.1")
assert.equal(source.username, "litestats_test")
assert.equal(source.pathname, "/litestats_mapbox_test")
assert.ok(source.port && !["5432", "5435", "55435"].includes(source.port))
process.env.DATABASE_URL = source.href
process.env.SEED_DEMO = "false"
const probe = new pg.Pool({connectionString: source.href})
assert.equal((await probe.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.length, 0, "Refusing an existing database")
await probe.end()
const {db, createUser, createSite, createSharedLink, findSharedLink} = await import("../src/lib/db")
const {getMapboxSettings, saveMapboxSettings, dashboardMapboxToken} = await import("../src/lib/mapbox-settings")
const pool = await db()
try {
  const owner = await createUser("owner@mapbox.invalid", "fixture-password", "Owner")
  const site = await createSite(owner.id, "mapbox.example.com", "UTC")
  const link = await createSharedLink(site.id, "Existing share")
  await pool.query("INSERT INTO site_map_settings(site_id,provider,mapbox_token) VALUES($1,'mapbox','OPAQUE_LEGACY_TOKEN')", [site.id])
  const before = (await pool.query("SELECT row_to_json(t) AS value FROM site_map_settings t")).rows
  const siteBefore = (await pool.query("SELECT row_to_json(t) AS value FROM sites t")).rows
  assert.deepEqual(await getMapboxSettings(), {enabled: false, configured: false})
  assert.equal(await dashboardMapboxToken(), "", "Old site keys must not be restored implicitly")
  await assert.rejects(saveMapboxSettings({enabled: true}))
  await assert.rejects(saveMapboxSettings({enabled: true, token: "sk.fixture.signature"}))
  const token = "pk.fixture.signature"
  assert.deepEqual(await saveMapboxSettings({enabled: true, token}), {enabled: true, configured: true})
  assert.equal(await dashboardMapboxToken(), token)
  const encrypted = (await pool.query("SELECT encrypted FROM litestats_mapbox_settings")).rows[0].encrypted
  assert.ok(encrypted && !encrypted.includes(token), "Token must be encrypted at rest")
  assert.ok(!JSON.stringify(await getMapboxSettings()).includes(token), "Management metadata must not expose the stored token")
  await saveMapboxSettings({enabled: false})
  assert.equal(await dashboardMapboxToken(), "")
  await saveMapboxSettings({enabled: true})
  assert.equal(await dashboardMapboxToken(), token, "Empty form input must preserve the saved token")
  await pool.query("UPDATE litestats_mapbox_settings SET encrypted='corrupt'")
  assert.equal(await dashboardMapboxToken(), "", "Damaged optional configuration must not break analytics")
  await saveMapboxSettings({enabled: true, token: "pk.replacement.signature"})
  assert.equal(await dashboardMapboxToken(), "pk.replacement.signature")
  await saveMapboxSettings({enabled: false, token: ""})
  assert.deepEqual(await getMapboxSettings(), {enabled: false, configured: false})
  assert.deepEqual((await pool.query("SELECT row_to_json(t) AS value FROM site_map_settings t")).rows, before)
  assert.deepEqual((await pool.query("SELECT row_to_json(t) AS value FROM sites t")).rows, siteBefore)
  assert.ok(await findSharedLink(link.slug))
  console.log("PASS: public-token validation, encryption, enable/disable/replacement, damaged-config fallback, existing sites/share/legacy map records preserved")
} finally { await pool.end() }
