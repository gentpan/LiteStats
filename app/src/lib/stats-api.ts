import { dateInTimezone, safeTimezone } from "./date-time"

export type StatsSite = {id:number; domain:string; timezone:string}
export type DailyStats = {visitors:number; visits:number; pageviews:number}
export type StatsSnapshot = {online:number; today:DailyStats; yesterday:DailyStats}
export const STATS_PERIODS = ["summary", "live", "today", "yesterday"] as const
export function statsDates(timezone:string, now:Date) {
  const today = dateInTimezone(timezone, now)
  const day = new Date(`${today}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate()-1)
  const yesterday = day.toISOString().slice(0,10)
  day.setUTCDate(day.getUTCDate()+2)
  return {today, yesterday, tomorrow:day.toISOString().slice(0,10)}
}

/** Injectable boundary keeps credential, scope and failure behavior testable. */
export function createStatsHandler(deps:{
  authorize:(token:string)=>Promise<StatsSite|null>
  snapshot:(site:StatsSite, dates:ReturnType<typeof statsDates>)=>Promise<StatsSnapshot>
  now?:()=>Date
}) {
  const windows = new Map<string,{start:number; count:number}>()
  return async (request:Request) => {
    const headers:Record<string,string> = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}
    const json = (body:unknown,status=200) => Response.json(body,{status,headers})
    const fail = (code:string,message:string,status:number) => json({error:{code,message}},status)
    if (request.method !== "GET") {headers.Allow="GET";return fail("method_not_allowed","Use GET.",405)}
    const url = new URL(request.url)
    if ([...url.searchParams.keys()].some(key=>!["domain","period"].includes(key)) || [...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1)) return fail("invalid_parameter","Only domain and period are supported, once each. Send credentials in Authorization.",400)
    const period = url.searchParams.get("period") ?? "summary"
    if (!(STATS_PERIODS as readonly string[]).includes(period)) return fail("invalid_period","Use summary, live, today or yesterday.",400)
    const domain = url.searchParams.get("domain")
    if (domain !== null && (!domain || domain.length>255)) return fail("invalid_domain","domain must contain 1–255 characters.",400)
    const token = /^Bearer ([a-f0-9]{16})$/i.exec(request.headers.get("authorization") || "")?.[1]
    if (!token) {headers["WWW-Authenticate"]='Bearer realm="LiteStats"';return fail("unauthorized","A valid site sharing credential is required.",401)}
    try {
      const site = await deps.authorize(token)
      if (!site) {headers["WWW-Authenticate"]='Bearer realm="LiteStats"';return fail("unauthorized","Invalid or revoked sharing credential.",401)}
      if (domain && domain.toLowerCase() !== site.domain.toLowerCase()) return fail("forbidden","This credential does not grant access to that domain.",403)
      const now = deps.now?.() || new Date()
      for (const [key,value] of windows) if (now.getTime()-value.start>=60_000) windows.delete(key)
      let window = windows.get(token)
      if (!window) {
        if (windows.size>=10_000) {headers["Retry-After"]="60";return fail("rate_limited","Service capacity reached. Retry later.",429)}
        window={start:now.getTime(),count:0};windows.set(token,window)
      }
      if (++window.count>60) {headers["Retry-After"]=String(Math.max(1,Math.ceil((window.start+60_000-now.getTime())/1000)));return fail("rate_limited","Limit: 60 requests per minute per credential per application process.",429)}
      const timezone = safeTimezone(site.timezone)
      const dates = statsDates(timezone,now)
      const stats = await deps.snapshot(site,dates)
      const data = period === "summary" ? {online:stats.online,today:{date:dates.today,...stats.today},yesterday:{date:dates.yesterday,...stats.yesterday}}
        : period === "live" ? {online:stats.online} : {date:dates[period as "today"|"yesterday"],...stats[period as "today"|"yesterday"]}
      return json({apiVersion:"1",site:{domain:site.domain,timezone},period,generatedAt:now.toISOString(),onlineWindowSeconds:300,data})
    } catch {return fail("service_unavailable","Statistics are temporarily unavailable. Retry later.",503)}
  }
}
