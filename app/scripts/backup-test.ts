import assert from 'node:assert/strict'
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { DATABASE_URL } from '../src/lib/env'
import { db } from '../src/lib/db'
import { ch } from '../src/lib/ch'
import { saveBackupSettings, runBackup, scanBackups, restoreBackup } from '../src/lib/backup'
assert.equal(new URL(DATABASE_URL).host,'127.0.0.1:55435','Only isolated test database is allowed')
const endpoint='http://127.0.0.1:59000'
const credentials={accessKeyId:'litestats-test',secretAccessKey:'litestats-local-test-only'}
const client=new S3Client({endpoint,region:'us-east-1',forcePathStyle:true,credentials})
const bucket=`litestats-test-${Date.now()}`
await client.send(new CreateBucketCommand({Bucket:bucket}))
await saveBackupSettings({provider:'s3',endpoint,region:'us-east-1',bucket,prefix:'test',access_key:credentials.accessKeyId,secret_key:credentials.secretAccessKey,schedule:'off',hour:3,minute:0,weekday:0,enabled:false})
const manifest=await runBackup('integration-test')
assert.ok((await scanBackups()).some(item=>item.id===manifest.id))
await restoreBackup(manifest.id)
const [row]=await (await ch().query({query:'SELECT count() AS n FROM events_v2',format:'JSONEachRow'})).json<{n:string}>()
assert.equal(Number(row.n),manifest.clickhouse.rows)
console.log(`PASS: local S3 upload, scan, PostgreSQL + ClickHouse restore (${row.n} events)`)
await client.send(new DeleteObjectCommand({Bucket:bucket,Key:`test/backups/${manifest.id}/${manifest.clickhouse.parts[0]}`}))
await assert.rejects(restoreBackup(manifest.id))
const [after] = await (await ch().query({query:'SELECT count() AS n FROM events_v2',format:'JSONEachRow'})).json<{n:string}>()
assert.equal(Number(after.n), manifest.clickhouse.rows)
console.log('PASS: missing backup part leaves live events unchanged')
await runBackup("preview-baseline")
client.destroy();await (await db()).end();await ch().close();process.exit(0)
