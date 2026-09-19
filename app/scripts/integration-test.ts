import { DEFAULT_MAP_SETTINGS } from "../src/lib/map-options"
import { getMapSettings, saveMapSettings } from "../src/lib/map-settings"
import assert from "node:assert/strict"
import { DATABASE_URL } from "../src/lib/env"
import { db, createUser, createSite, findSiteForUser, listSites, saveTotpSecret, getTotpState, replaceRecoveryCodes, consumeRecoveryCode, deleteSite, eventSession } from "../src/lib/db"
import { asBuffer } from "../src/lib/webauthn"
import { hashRecoveryCode } from "../src/lib/totp"
import { ch, ensureEventColumns, queueEvent, flushEventQueue } from "../src/lib/ch"
// This runner deliberately refuses any existing/remote database endpoint.
assert.equal(new URL(DATABASE_URL).host, '127.0.0.1:55435', 'Use the isolated local test database')
const suffix=Date.now().toString(36)
const owner=await createUser(`owner-${suffix}@test.invalid`,'test-password','Test owner')
const viewer=await createUser(`viewer-${suffix}@test.invalid`,'test-password','Test viewer')
const site=await createSite(owner.id,`integration-${suffix}.test`,'Asia/Shanghai')
assert.deepEqual(await getMapSettings(site.id), {...DEFAULT_MAP_SETTINGS})
await saveMapSettings(site.id, {...DEFAULT_MAP_SETTINGS, provider: "google", apiKey: "TEST_LOCAL_ONLY"})
assert.deepEqual(await getMapSettings(site.id), {...DEFAULT_MAP_SETTINGS, provider: "google", apiKey: "TEST_LOCAL_ONLY"})
await saveMapSettings(site.id, {...DEFAULT_MAP_SETTINGS, provider: "mapbox", mapboxToken: "pk.TEST_LOCAL_ONLY", mapboxStyle: "dark"})
assert.equal((await getMapSettings(site.id)).mapboxStyle, "dark")
await saveMapSettings(site.id, {...DEFAULT_MAP_SETTINGS})
assert.deepEqual(await getMapSettings(site.id), {...DEFAULT_MAP_SETTINGS})
assert.equal(await findSiteForUser(viewer.id,site.domain),null)
await (await db()).query("INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1,$2,'viewer')",[viewer.id,site.team_id])
await (await db()).query('DELETE FROM team_memberships WHERE user_id=$1 AND team_id<>$2',[viewer.id,site.team_id])
assert.ok(await findSiteForUser(viewer.id,site.domain))
assert.equal(await findSiteForUser(viewer.id,site.domain,'write'),null)
assert.equal(await findSiteForUser(viewer.id,site.domain,'admin'),null)
const secret=Buffer.from('12345678901234567890')
await saveTotpSecret(owner.id,secret)
assert.deepEqual(asBuffer((await getTotpState(owner.id))?.totp_secret),secret)
await replaceRecoveryCodes(owner.id,[await hashRecoveryCode('ONEUSE')])
const used=await Promise.all([consumeRecoveryCode(owner.id,'ONEUSE'),consumeRecoveryCode(owner.id,'ONEUSE')])
assert.equal(used.filter(Boolean).length,1)
const identity = `session-${suffix}`
const session1 = await eventSession(identity)
assert.equal(await eventSession(identity), session1)
await (await db()).query("UPDATE event_sessions SET last_seen_at=now()-interval '31 minutes' WHERE identity=$1", [identity])
assert.notEqual(await eventSession(identity), session1)
await ensureEventColumns()
queueEvent({siteId:Number(site.id),name:'pageview',hostname:site.domain,pathname:'/',referrer:'',referrerSource:'Direct',userId:'123',sessionId:'456',browser:'Test',browserVersion:'1',os:'Linux',osVersion:'',device:'Desktop',country:'',title:'Integration',language:'zh',screen:'1920x1080',query:'',keyword:'',utm:{source:'',medium:'',campaign:''},props:{}})
await flushEventQueue()
const rows=await (await ch().query({query:`SELECT count() AS n FROM events_v2 WHERE site_id=${Number(site.id)} AND hostname='${site.domain}'`,format:'JSONEachRow'})).json<{n:string}>()
assert.equal(Number(rows[0].n),1)
await deleteSite(site.id)
assert.equal((await listSites(owner.id)).length,0)
await (await db()).end()
await ch().close()
console.log('PASS: map settings save/reset, local databases, team isolation, read-only role, TOTP storage, one-use recovery, event ingestion, idle session expiry, transactional deletion')
process.exit(0)
