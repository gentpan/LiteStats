import assert from "node:assert/strict"
import pg from "pg"
import type { ExpirySnapshot } from "../src/lib/site-check-probe"

const source = new URL(process.env.LITESTATS_TEST_DATABASE_URL || "")
assert.equal(source.hostname, "127.0.0.1")
assert.equal(source.username, "litestats_test")
assert.equal(source.pathname, "/litestats_checks_test")
assert.ok(source.port && !["5432", "5435", "55435"].includes(source.port))
process.env.DATABASE_URL = source.href
process.env.SEED_DEMO = "false"
process.env.LITESTATS_HEALTH_WORKER = "false"
const probe = new pg.Pool({connectionString: source.href})
assert.equal((await probe.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.length, 0, "Refusing a database that already contains tables")
await probe.end()
const {db, createUser, createSite, createSharedLink, findSharedLink, findSiteForUser, updateSite} = await import("../src/lib/db")
const {siteCheckReport, saveSiteCheck, runSiteCheck, siteCheckDb} = await import("../src/lib/site-checks")
const pool = await db()
try {
  const owner = await createUser("owner@checks.invalid", "fixture-password", "Owner")
  const viewer = await createUser("viewer@checks.invalid", "fixture-password", "Viewer")
  const outsider = await createUser("outsider@checks.invalid", "fixture-password", "Outsider")
  const site = await createSite(owner.id, "checks.example.com", "UTC")
  await pool.query("INSERT INTO team_memberships(user_id,team_id,role) VALUES($1,$2,'viewer')", [viewer.id, site.team_id])
  const shared = await createSharedLink(site.id, "Existing share")
  assert.equal((await siteCheckReport(site)).enabled, false)
  assert.ok(await findSiteForUser(viewer.id, site.domain))
  assert.equal(await findSiteForUser(viewer.id, site.domain, "admin"), null)
  assert.equal(await findSiteForUser(outsider.id, site.domain), null)
  await pool.query("INSERT INTO litestats_channels(channel,encrypted) VALUES('smtp','SYNTHETIC_LEGACY_VALUE')")
  const before = (await pool.query("SELECT row_to_json(c) AS value FROM litestats_channels c")).rows
  const settingsBefore = (await pool.query("SELECT row_to_json(s) AS value FROM sites s WHERE id=$1", [site.id])).rows
  let calls = 0, expiryCalls = 0
  let hold: Promise<void> = Promise.resolve()
  let failDomain = false, failCertificate = false
  const probes = {
    http: async () => {calls++; await hold; return {checkedAt: new Date().toISOString(), ok: true, status: 200, durationMs: 123, error: null}},
    expiry: async (): Promise<ExpirySnapshot> => {expiryCalls++; return {checkedAt: new Date().toISOString(),
      domain: {domain: "example.com", expiresAt: failDomain ? null : "2027-12-01T00:00:00Z", error: failDomain ? "检查超时" : null},
      certificate: {expiresAt: failCertificate ? null : "2027-01-01T00:00:00Z", valid: !failCertificate, error: failCertificate ? "检查超时" : null},
    }},
  }
  assert.equal(await runSiteCheck(site.id, true, probes), false)
  await saveSiteCheck(site, true, "/health")
  const claims = await Promise.all(Array.from({length: 8}, () => runSiteCheck(site.id, false, probes)))
  assert.equal(claims.filter(Boolean).length, 1)
  assert.equal(calls, 1)
  let report = await siteCheckReport(site)
  assert.equal(report.latest?.status, 200)
  assert.equal(report.checks.length, 1)
  assert.equal(report.expiry?.domain.domain, "example.com")
  assert.equal(await runSiteCheck(site.id, true, probes), false, "Manual cooldown must be enforced")
  const due = () => pool.query("UPDATE site_check_settings SET last_started_at=now()-interval '2 minutes',next_check_at=now()-interval '1 minute' WHERE site_id=$1", [site.id])
  await due()
  await runSiteCheck(site.id, false, probes)
  assert.equal(expiryCalls, 1, "Expiry checks are cached for one day")
  await pool.query("UPDATE site_check_settings SET expiry=jsonb_set(expiry,'{checkedAt}',to_jsonb((now()-interval '2 days')::text)) WHERE site_id=$1", [site.id])
  await due(); await runSiteCheck(site.id, false, probes)
  assert.equal(expiryCalls, 2)
  const goodExpiry = (await siteCheckReport(site)).expiry!
  failDomain = failCertificate = true
  await due(); await runSiteCheck(site.id, true, probes)
  report = await siteCheckReport(site)
  assert.equal(expiryCalls, 3, "Manual checks refresh even a fresh expiry cache")
  assert.equal(report.expiry?.domain.expiresAt, goodExpiry.domain.expiresAt)
  assert.equal(report.expiry?.certificate.expiresAt, goodExpiry.certificate.expiresAt)
  assert.equal(report.expiry?.certificate.valid, false)
  assert.equal(report.expiry?.certificate.stale, true)
  assert.equal(report.expiry?.domain.error, "检查超时")
  assert.equal(report.expiry?.domain.lastSuccessAt, goodExpiry.domain.lastSuccessAt)
  assert.equal(await runSiteCheck(site.id, true, probes), false, "Failures still respect the manual cooldown")
  await due(); await runSiteCheck(site.id, false, probes)
  assert.equal(expiryCalls, 3, "Failed queries are not repeated every five minutes")
  await pool.query("UPDATE site_check_settings SET expiry=jsonb_set(expiry,'{checkedAt}',to_jsonb((now()-interval '16 minutes')::text)) WHERE site_id=$1", [site.id])
  failDomain = false
  await due(); await runSiteCheck(site.id, false, probes)
  assert.equal(expiryCalls, 4, "Failures retry after 15 minutes rather than a day")
  report = await siteCheckReport(site)
  assert.equal(report.expiry?.domain.stale, false)
  assert.equal(report.expiry?.domain.error, null)
  assert.equal(report.expiry?.certificate.stale, true)
  assert.equal(report.expiry?.certificate.lastSuccessAt, goodExpiry.certificate.lastSuccessAt)
  failCertificate = false
  await due(); await runSiteCheck(site.id, true, probes)
  assert.equal(expiryCalls, 5, "Manual retry refreshes the failed component immediately after cooldown")
  report = await siteCheckReport(site)
  assert.equal(report.expiry?.certificate.stale, false)
  assert.equal(report.expiry?.certificate.valid, true)
  assert.equal(report.expiry?.certificate.error, null)
  const savedExpiry = report.expiry
  let release: () => void = () => {}
  hold = new Promise<void>(resolve => {release = resolve})
  await due()
  const inflight = runSiteCheck(site.id, true, probes)
  for (let i = 0; calls < 8 && i < 100; i++) await Bun.sleep(5)
  assert.equal(calls, 8)
  await saveSiteCheck(site, false, "/health")
  release(); await inflight
  report = await siteCheckReport(site)
  assert.equal(report.enabled, false)
  assert.equal(report.checks.length, 7, "Pausing invalidates the running result without deleting past checks")
  assert.deepEqual(report.expiry, savedExpiry, "Pausing also discards an in-flight expiry refresh")
  await saveSiteCheck(site, true, "/other")
  assert.equal((await siteCheckReport(site)).checks.length, 0, "Different paths must not reuse old response curves")
  assert.equal((await pool.query("SELECT count(*) FROM site_check_results WHERE site_id=$1", [site.id])).rows[0].count, 7)
  await updateSite(site.id, {domain: "renamed.example.com"})
  report = await siteCheckReport({...site, domain: "renamed.example.com"})
  assert.equal(report.expiry, null, "Domain rename cannot reuse the old domain expiry")
  failDomain = failCertificate = true
  await due(); await runSiteCheck(site.id, true, probes)
  report = await siteCheckReport({...site, domain: "renamed.example.com"})
  assert.equal(report.expiry?.domain.expiresAt, null, "Failed queries on a new host cannot fall back to the old host's dates")
  assert.equal(report.expiry?.certificate.expiresAt, null)
  await updateSite(site.id, {domain: site.domain})
  assert.equal((await findSharedLink(shared.slug))?.site.id, site.id)
  const afterSettings = (await pool.query("SELECT row_to_json(s) AS value FROM sites s WHERE id=$1", [site.id])).rows
  for (const field of ["timezone", "team_id", "public", "name"]) assert.equal(afterSettings[0].value[field], settingsBefore[0].value[field])
  assert.deepEqual((await pool.query("SELECT row_to_json(c) AS value FROM litestats_channels c")).rows, before)
  await siteCheckDb()
  console.log("PASS: default off, owner/viewer/outsider permissions, atomic claims, cooldown, daily cache, manual expiry refresh, retained dates on failures, 15-minute retry, partial/full recovery, pause during flight, path/domain isolation, retained history, existing sharing and settings")
} finally {await pool.end()}
