import type { ClickHouseClient } from "@clickhouse/client"
import { safeTimezone } from "./date-time"
import type { StatsSite, StatsSnapshot, statsDates } from "./stats-api"

export async function readStatsSnapshot(client:Pick<ClickHouseClient,"query">, site:StatsSite, dates:ReturnType<typeof statsDates>):Promise<StatsSnapshot> {
    const result = await client.query({
      query:`SELECT
        uniqExactIf(user_id, timestamp >= now() - INTERVAL 5 MINUTE) AS online,
        uniqExactIf(user_id, timestamp >= toDateTime({today:String}, {zone:String}) AND timestamp < toDateTime({tomorrow:String}, {zone:String})) AS today_visitors,
        uniqExactIf(session_id, timestamp >= toDateTime({today:String}, {zone:String}) AND timestamp < toDateTime({tomorrow:String}, {zone:String})) AS today_visits,
        countIf(name = 'pageview' AND timestamp >= toDateTime({today:String}, {zone:String}) AND timestamp < toDateTime({tomorrow:String}, {zone:String})) AS today_pageviews,
        uniqExactIf(user_id, timestamp < toDateTime({today:String}, {zone:String})) AS yesterday_visitors,
        uniqExactIf(session_id, timestamp < toDateTime({today:String}, {zone:String})) AS yesterday_visits,
        countIf(name = 'pageview' AND timestamp < toDateTime({today:String}, {zone:String})) AS yesterday_pageviews
        FROM events_v2 WHERE site_id = {site:UInt64}
        AND timestamp >= toDateTime({yesterday:String}, {zone:String})
        AND timestamp < toDateTime({tomorrow:String}, {zone:String})`,
      query_params:{site:site.id, zone:safeTimezone(site.timezone), today:`${dates.today} 00:00:00`,yesterday:`${dates.yesterday} 00:00:00`,tomorrow:`${dates.tomorrow} 00:00:00`},
      clickhouse_settings:{max_execution_time:10}, format:"JSONEachRow",
    })
    const [row] = await result.json<Record<string,string|number>>()
    if (!row) throw new Error("Missing statistics result")
    const number = (key:string) => {const value=row[key];const n=Number(value);if(value==null||value===""||!Number.isSafeInteger(n)||n<0)throw new Error("Invalid metric");return n}
    const daily = (prefix:string) => ({visitors:number(`${prefix}_visitors`),visits:number(`${prefix}_visits`),pageviews:number(`${prefix}_pageviews`)})
    return {online:number("online"),today:daily("today"),yesterday:daily("yesterday")} satisfies StatsSnapshot
}
