import assert from 'node:assert/strict'
import { ch, ensureEventColumns, recentVisitors, siteOverview, breakdown } from '../src/lib/ch'
import { CLICKHOUSE_URL } from '../src/lib/env'
assert.equal(new URL(CLICKHOUSE_URL).host,'127.0.0.1:58123','Only the isolated local database is allowed')
const site=8_000_000_000+Date.now()%1_000_000_000
await ensureEventColumns()
const now=Math.floor(Date.now()/1000)
const base={site_id:site,name:'pageview',hostname:'controls-test.invalid',pathname:'/docs',referrer_source:'Google',browser:'Chrome',browser_version:'130',operating_system:'Linux',operating_system_version:'6',screen_size:'Desktop',screen_resolution:'1920x1080',browser_language:'zh-CN',country_code:'CN',user_id:'101',session_id:'101'}
try {
 await ch().insert({table:'events_v2',format:'JSONEachRow',values:[
 {...base,timestamp:now-60}, {...base,timestamp:now-120,pathname:'/start'},
 {...base,timestamp:now-600,user_id:'102',session_id:'102',browser:'',operating_system:'',screen_size:'',referrer_source:'',country_code:'US',pathname:'/mobile'},
 {...base,timestamp:now-1900,user_id:'103',session_id:'103'},
 {...base,timestamp:Date.parse('2024-01-01T18:00:00Z')/1000,user_id:'104',session_id:'104'},
 ]})
 const visitors=await recentVisitors(site)
 assert.equal(visitors.total,2); assert.equal(visitors.online,1)
 assert.equal(visitors.rows[0].pageviews,2); assert.equal(visitors.rows[0].browser,'Chrome 130')
 assert.equal(visitors.rows[0].screen,'1920x1080');assert.equal(visitors.rows[0].active,true)
 assert.deepEqual([...visitors.rows[0].pages].sort(),['/docs','/start'])
 assert.equal(visitors.rows[1].active,false)
 const range={from:'realtime',to:'realtime'}
 for(const [filter,expected] of [[{page:'/start'},1],[{source:'Google'},1],[{source:'Direct'},1],[{country:'US'},1],[{browser:'Chrome'},1],[{browser:'(none)'},1],[{os:'(none)'},1],[{device:'(none)'},1],[{page:"/docs' OR 1=1 --"},0],[{page:'/start',country:'US'},0]] as const) {
   const data=await siteOverview(site,range,filter,'minute')
   assert.equal(data.overview.visitors,expected,JSON.stringify(filter))
 }
 const jan1=await siteOverview(site,{from:'2024-01-01',to:'2024-01-01',timezone:'UTC'})
 assert.equal(jan1.overview.visitors,1)
 const jan1Shanghai=await siteOverview(site,{from:'2024-01-01',to:'2024-01-01',timezone:'Asia/Shanghai'})
 assert.equal(jan1Shanghai.overview.visitors,0)
 const jan2Shanghai=await siteOverview(site,{from:'2024-01-02',to:'2024-01-02',timezone:'Asia/Shanghai'})
 assert.equal(jan2Shanghai.overview.visitors,1)
 assert.equal((await breakdown(site,range,'page',{source:'Direct'}))[0].name,'/mobile')
 assert.equal((await recentVisitors(site+1)).total,0)
 console.log('PASS: visitor deduplication, 5m/30m boundaries, device details, six filters, combined filters, unknown values, injection literal, timezone dates, breakdown and site isolation')
} finally {
 await ch().command({query:`ALTER TABLE events_v2 DELETE WHERE site_id=${site}`,clickhouse_settings:{mutations_sync:'1'}})
 await ch().close()
}
