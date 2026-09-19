import assert from "node:assert/strict"
import pg from "pg"

const source=new URL(process.env.DATABASE_URL || "")
assert.equal(source.host,"127.0.0.1:55435","Only use the isolated local database server")
const admin=new pg.Pool({connectionString:source.toString()})
const name=`litestats_channels_test_${Date.now()}`
await admin.query(`CREATE DATABASE "${name}"`)
source.pathname=`/${name}`
process.env.DATABASE_URL=source.toString()
process.env.SEED_DEMO="false"
let close:(()=>Promise<void>)|undefined
try {
  const {db}=await import("../src/lib/db")
  close=async()=>{await (await db()).end()}
  const {getChannelSettings,saveChannelSettings,clearChannelSettings}=await import("../src/lib/channel-settings")
  const initial=await getChannelSettings()
  assert.equal(initial.smtp.configured,false)
  assert.equal(initial.telegram.hasToken,false)
  await assert.rejects(saveChannelSettings({channel:"telegram",settings:{token:"",chatId:"123"}}))
  const saved=await saveChannelSettings({channel:"smtp",settings:{host:"smtp.example.com",port:587,security:"starttls",username:"fixture",password:"FIXTURE_PASSWORD",fromEmail:"test@example.com",fromName:"Test"}})
  assert.equal(saved.smtp.password,"")
  assert.equal(saved.smtp.hasPassword,true)
  const kept=await saveChannelSettings({channel:"smtp",settings:{...saved.smtp,fromName:"Changed"}})
  assert.equal(kept.smtp.hasPassword,true)
  assert.equal(kept.smtp.fromName,"Changed")
  const telegram=await saveChannelSettings({channel:"telegram",settings:{token:"12345:FIXTURE_TOKEN",chatId:"-10012345"}})
  assert.equal(telegram.telegram.token,"")
  assert.equal(telegram.telegram.hasToken,true)
  const rows=await (await db()).query("SELECT encrypted FROM litestats_channels")
  assert.ok(rows.rows.every(row=>!row.encrypted.includes("FIXTURE_")))
  const preserved=await saveChannelSettings({channel:"telegram",settings:{token:"",chatId:"-10067890"}})
  assert.equal(preserved.telegram.hasToken,true)
  await clearChannelSettings("smtp")
  const cleared=await clearChannelSettings("telegram")
  assert.equal(cleared.smtp.configured,false)
  assert.equal(cleared.telegram.hasToken,false)
  console.log("PASS: isolated channel storage, secret encryption/masking, blank-secret preservation, validation and explicit clearing; no external messages sent")
} finally {
  await close?.()
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin.end()
}
