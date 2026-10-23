import { describe, expect, test } from "bun:test"
import { createStatsHandler, statsDates } from "../src/lib/stats-api"
import { readStatsSnapshot } from "../src/lib/stats-api-query"
import { createClient, type ClickHouseClient } from "@clickhouse/client"

const token = "0123456789abcdef"
const site = {id:17, domain:"example.com", timezone:"Asia/Shanghai"}
const sample = {online:3,today:{visitors:12,visits:15,pageviews:27},yesterday:{visitors:8,visits:10,pageviews:20}}
function setup() {
  let now = new Date("2026-01-01T17:00:00Z"), revoked=false, unavailable=false, authCalls=0, queryCalls=0
  const handler=createStatsHandler({
    now:()=>now,
    authorize:async value=>{authCalls++;return value===token&&!revoked?site:null},
    snapshot:async (authorized,dates)=>{
      queryCalls++
      expect(authorized.id).toBe(17)
      expect(dates).toEqual({today:"2026-01-02",yesterday:"2026-01-01",tomorrow:"2026-01-03"})
      if(unavailable)throw new Error("sensitive database connection")
      return sample
    },
  })
  return {handler,request:(query="",credential:string|null=token,method="GET")=>handler(new Request(`https://stats.example.com/api/v1/stats${query}`,{method,headers:credential?{authorization:`Bearer ${credential}`}:{}})),
    revoke:()=>{revoked=true},fail:()=>{unavailable=true},advance:()=>{now=new Date(now.getTime()+60_001)},counts:()=>({authCalls,queryCalls})}
}

describe("external read API",()=>{
  test("summary returns scoped numeric metrics with the site's calendar dates and no cache or CORS access",async()=>{
    const app=setup(), response=await app.request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({apiVersion:"1",site:{domain:"example.com",timezone:"Asia/Shanghai"},period:"summary",generatedAt:"2026-01-01T17:00:00.000Z",onlineWindowSeconds:300,data:{online:3,today:{date:"2026-01-02",...sample.today},yesterday:{date:"2026-01-01",...sample.yesterday}}})
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.has("access-control-allow-origin")).toBe(false)
  })
  test.each(["live","today","yesterday"])("returns the documented %s response",async period=>{
    const response=await setup().request(`?period=${period}&domain=EXAMPLE.COM`)
    expect(response.status).toBe(200)
    const body=await response.json()
    expect(body.period).toBe(period)
    expect(body.data).toEqual(period==="live"?{online:3}:{date:period==="today"?"2026-01-02":"2026-01-01",...sample[period as "today"|"yesterday"]})
  })
  test.each([null,"bad","fedcba9876543210"])("missing, malformed or unknown credentials never query metrics",async credential=>{
    const app=setup(),response=await app.request("",credential)
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain("Bearer")
    expect(app.counts().queryCalls).toBe(0)
  })
  test("an existing browser session cannot replace the required credential",async()=>{
    const response=await setup().handler(new Request("https://stats.example.com/api/v1/stats",{headers:{cookie:"session=not-an-api-credential"}}))
    expect(response.status).toBe(401)
  })
  test("rechecks revocation on every request and isolates domains",async()=>{
    const app=setup()
    expect((await app.request("?domain=other.example")).status).toBe(403)
    expect(app.counts().queryCalls).toBe(0)
    expect((await app.request()).status).toBe(200)
    app.revoke()
    expect((await app.request()).status).toBe(401)
    expect(app.counts().queryCalls).toBe(1)
  })
  test.each(["?period=week","?period=","?domain=","?period=today&period=yesterday","?domain=example.com&domain=other.example","?token=0123456789abcdef","?from=2026-01-01"])("rejects unsupported or repeated inputs %s before storage access",async query=>{
    const app=setup()
    expect((await app.request(query)).status).toBe(400)
    expect(app.counts()).toEqual({authCalls:0,queryCalls:0})
  })
  test("only accepts GET",async()=>{
    const response=await setup().request("",token,"POST")
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET")
  })
  test("returns a bounded error rather than false zero traffic or leaked internals on failure",async()=>{
    const app=setup();app.fail()
    const response=await app.request()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({error:{code:"service_unavailable",message:"Statistics are temporarily unavailable. Retry later."}})
  })
  test("limits query work to 60 requests then resets the window",async()=>{
    const app=setup()
    for(let index=0;index<60;index++)expect((await app.request()).status).toBe(200)
    const response=await app.request()
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    expect(app.counts().queryCalls).toBe(60)
    app.advance()
    expect((await app.request()).status).toBe(200)
  })
})

describe("statistics date boundaries",()=>{
  test.each([
    ["America/New_York","2026-03-08T07:30:00Z","2026-03-08","2026-03-07","2026-03-09"],
    ["America/New_York","2026-11-01T06:30:00Z","2026-11-01","2026-10-31","2026-11-02"],
    ["Pacific/Kiritimati","2026-12-31T12:00:00Z","2027-01-01","2026-12-31","2027-01-02"],
    ["invalid/zone","2026-01-01T23:00:00Z","2026-01-01","2025-12-31","2026-01-02"],
  ])("uses local calendar dates in %s at %s",(zone,now,today,yesterday,tomorrow)=>{
    expect(statsDates(zone,new Date(now))).toEqual({today,yesterday,tomorrow})
  })
})

describe("statistics result integrity",()=>{
  const dates=statsDates(site.timezone,new Date("2026-01-01T17:00:00Z"))
  const fields=["online","today_visitors","today_visits","today_pageviews","yesterday_visitors","yesterday_visits","yesterday_pageviews"]
  const row=Object.fromEntries(fields.map((key,index)=>[key,String(index)]))
  const client=(rows:Record<string,unknown>[])=>({query:async()=>({json:async()=>rows})}) as unknown as Pick<ClickHouseClient,"query">
  test("converts database UInt64 strings to numbers and preserves genuine zeroes",async()=>{
    expect(await readStatsSnapshot(client([row]),site,dates)).toEqual({online:0,today:{visitors:1,visits:2,pageviews:3},yesterday:{visitors:4,visits:5,pageviews:6}})
  })
  test("sends typed site and timezone parameters through the actual database HTTP client",async()=>{
    let received:URL|undefined
    const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:request=>{
      received=new URL(request.url)
      return new Response(JSON.stringify(row)+"\n",{headers:{"content-type":"application/x-ndjson"}})
    }})
    const httpClient=createClient({url:`http://127.0.0.1:${server.port}`})
    try {
      const result=await readStatsSnapshot(httpClient,site,dates)
      expect(result.yesterday.pageviews).toBe(6)
      expect(received?.searchParams.get("param_site")).toBe("17")
      expect(received?.searchParams.get("param_zone")).toBe("Asia/Shanghai")
      expect(received?.searchParams.get("param_today")).toBe("2026-01-02 00:00:00")
      expect(received?.searchParams.get("param_yesterday")).toBe("2026-01-01 00:00:00")
      expect(received?.searchParams.get("param_tomorrow")).toBe("2026-01-03 00:00:00")
    } finally {await httpClient.close();await server.stop(true)}
  })
  test.each([[],[{}],[{...row,online:"broken"}],[{...row,online:null}],[{...row,online:-1}],[{...row,online:""}]].map(rows=>({rows})))("rejects missing or corrupt metrics instead of inventing zeroes",async ({rows})=>{
    await expect(readStatsSnapshot(client(rows),site,dates)).rejects.toThrow()
  })
})
