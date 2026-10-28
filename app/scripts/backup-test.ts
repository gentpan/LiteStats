import assert from 'node:assert/strict'
import { S3Client, CreateBucketCommand, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { DATABASE_URL, CLICKHOUSE_URL } from '../src/lib/env'
import { db } from '../src/lib/db'
import { ch, ensureEventColumns, queueEvent, drainEventQueue } from '../src/lib/ch'
import { saveBackupSettings, runBackup, scanBackups, restoreBackup } from '../src/lib/backup'
assert.equal(new URL(DATABASE_URL).host,'127.0.0.1:55435','Only isolated test database is allowed')
assert.equal(new URL(CLICKHOUSE_URL).host, "127.0.0.1:58123", "Only the isolated local ClickHouse is allowed")
const endpoint='http://127.0.0.1:59000'
const credentials={accessKeyId:'litestats-test',secretAccessKey:'litestats-local-test-only'}
const client=new S3Client({endpoint,region:'us-east-1',forcePathStyle:true,credentials})
const bucket=`litestats-test-${Date.now()}`
await client.send(new CreateBucketCommand({Bucket:bucket}))
await saveBackupSettings({provider:'s3',endpoint,region:'us-east-1',bucket,prefix:'test',access_key:credentials.accessKeyId,secret_key:credentials.secretAccessKey,schedule:'off',hour:3,minute:0,weekday:0,enabled:false})
await ensureEventColumns()
for(let i=0;i<450;i++)queueEvent({siteId:1,name:"pageview",hostname:"fixture.example",pathname:"/",referrer:"",referrerSource:"",userId:`fixture-${i}`,sessionVisitorId:`monthly-${i}`,sessionId:`fixture-${i}`})
await drainEventQueue()
const user=await(await db()).query<{id:number,name:string}>("SELECT id,name FROM users ORDER BY id LIMIT 1")
assert.ok(user.rows[0],"Isolated fixture needs an account")
const manifest=await runBackup('integration-test')
assert.ok((await scanBackups()).some(item=>item.id===manifest.id))
await(await db()).query("UPDATE users SET name=$1 WHERE id=$2",["changed-after-backup",user.rows[0].id])
await restoreBackup(manifest.id)
assert.equal((await(await db()).query("SELECT name FROM users WHERE id=$1",[user.rows[0].id])).rows[0].name,user.rows[0].name)
const [row]=await (await ch().query({query:'SELECT count() AS n FROM events_v2',format:'JSONEachRow'})).json<{n:string}>()
assert.equal(Number(row.n),manifest.clickhouse.rows)
console.log(`PASS: local S3 upload, scan, PostgreSQL + ClickHouse restore (${row.n} events)`)
const objectKey=`test/backups/${manifest.id}/${manifest.clickhouse.parts[0]}`
const original=await(await client.send(new GetObjectCommand({Bucket:bucket,Key:objectKey}))).Body!.transformToByteArray()
const corrupted=Buffer.from(original);corrupted[Math.floor(corrupted.length/2)]^=1
await client.send(new PutObjectCommand({Bucket:bucket,Key:objectKey,Body:corrupted}))
await assert.rejects(restoreBackup(manifest.id),/校验失败/)
assert.equal(Number((await(await ch().query({query:"SELECT count() AS n FROM events_v2",format:"JSONEachRow"})).json<{n:string}>())[0].n),manifest.clickhouse.rows)
assert.equal((await(await db()).query("SELECT name FROM users WHERE id=$1",[user.rows[0].id])).rows[0].name,user.rows[0].name)
await client.send(new PutObjectCommand({Bucket:bucket,Key:objectKey,Body:original}))
console.log('PASS: corrupt cloud part rejected without changing either database')
await client.send(new DeleteObjectCommand({Bucket:bucket,Key:`test/backups/${manifest.id}/${manifest.clickhouse.parts[0]}`}))
await assert.rejects(restoreBackup(manifest.id))
const [after] = await (await ch().query({query:'SELECT count() AS n FROM events_v2',format:'JSONEachRow'})).json<{n:string}>()
assert.equal(Number(after.n), manifest.clickhouse.rows)
console.log('PASS: missing backup part leaves live events unchanged')
await runBackup("preview-baseline")
client.destroy();await (await db()).end();await ch().close();process.exit(0)
