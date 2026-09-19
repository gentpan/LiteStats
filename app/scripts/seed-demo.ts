import assert from 'node:assert/strict'
import { DATABASE_URL, SEED_DEMO } from '../src/lib/env'
import { db, findUserByEmail, listSites, createSite } from '../src/lib/db'
import { saveSiteMonitor } from '../src/lib/site-monitor'
import { ch, ensureEventColumns } from '../src/lib/ch'
assert.ok(SEED_DEMO && new URL(DATABASE_URL).host === '127.0.0.1:55435', 'Demo seed is only allowed in the isolated preview database')
const user = await findUserByEmail('demo@litestats.dev')
assert.ok(user)
let site = (await listSites(user.id)).find(s=>s.domain==='demo.local.test')
if(!site) site=await createSite(user.id,'demo.local.test','Asia/Shanghai')
await saveSiteMonitor(site.id,{enabled:false})
await ensureEventColumns()
const [{n}] = await (await ch().query({query:`SELECT count() AS n FROM events_v2 WHERE site_id=${Number(site.id)}`,format:'JSONEachRow'})).json<{n:string}>()
if(!Number(n)) {
 const rows=[]
 for(let day=0;day<28;day++) for(let visitor=0;visitor<25+(day%7)*8;visitor++) {
  const at=new Date(Date.now()-day*86400000-visitor*60000)
  const pages=['/','/pricing','/docs','/blog/hello']
  for(let page=0;page<1+visitor%3;page++) rows.push({timestamp:new Date(at.getTime()+page*20000).toISOString().replace('T',' ').slice(0,19),name:'pageview',site_id:Number(site.id),user_id:String(day*1000+visitor),session_id:`demo-${day}-${visitor}`,hostname:site.domain,pathname:pages[(visitor+page)%4],referrer_source:['Direct','Google','github.com'][visitor%3],browser:['Chrome','Safari','Firefox'][visitor%3],operating_system:['Windows','macOS','Linux'][visitor%3],screen_size:visitor%3?'Desktop':'Mobile',country_code:['US','CN','DE','JP'][visitor%4],page_title:['首页（演示）','价格（演示）','文档（演示）','博客（演示）'][(visitor+page)%4],browser_language:'zh-CN',screen_resolution:'1920x1080'})
 }
 await ch().insert({table:'events_v2',format:'JSONEachRow',values:rows})
 console.log(`Created ${rows.length} explicitly synthetic demo events`)
}
await (await db()).end();await ch().close();process.exit(0)
