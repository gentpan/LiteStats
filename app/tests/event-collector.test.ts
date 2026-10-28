import { expect, spyOn, test } from "bun:test"
import * as database from "../src/lib/db"
import * as clickhouse from "../src/lib/ch"
import { Route } from "../src/routes/api/event"
import * as location from "../src/lib/visitor-location"

// Invoke the actual HTTP route while intercepting every database/queue operation.
// These tests never connect to a database or create real analytics events.
const collect = (Route.options.server!.handlers as {
  POST: (input: {request: Request}) => Promise<Response>
}).POST

function request(headers: Record<string, string> = {}, data: Record<string, unknown> = {}) {
  return new Request("https://stats.example.com/api/event", {
    method: "POST", headers: {Origin: "https://shop.example.com", "Content-Type": "text/plain;charset=UTF-8", ...headers},
    body: JSON.stringify({d: "shop.example.com", u: "https://shop.example.com/product", ...data}),
  })
}

async function withCollector(run: (state: {find: ReturnType<typeof spyOn<typeof database, "findSiteByDomain">>;
  session: ReturnType<typeof spyOn<typeof database, "eventSession">>;
  queue: ReturnType<typeof spyOn<typeof clickhouse, "queueEvent">>}) => Promise<void>) {
  const find = spyOn(database, "findSiteByDomain").mockResolvedValue({
    id: 7, domain: "shop.example.com", name: "Fixture", timezone: "UTC", team_id: 2,
    public: false, allowed_event_props: null,
  })
  const session = spyOn(database, "eventSession").mockResolvedValue("fixture-session")
  const queue = spyOn(clickhouse, "queueEvent").mockReturnValue(true)
  try { await run({find, session, queue}) }
  finally { find.mockRestore(); session.mockRestore(); queue.mockRestore() }
}

test("collector acknowledges only events accepted by the bounded queue", async () => {
  await withCollector(async ({queue}) => {
    const accepted = await collect({request: request()})
    expect(accepted.status).toBe(202)
    expect(accepted.headers.get("Retry-After")).toBeNull()
    expect(queue).toHaveBeenCalledTimes(1)
    expect(queue.mock.calls[0][0]).toMatchObject({siteId: 7, pathname: "/product", sessionId: "fixture-session"})

    queue.mockReturnValue(false)
    const busy = await collect({request: request()})
    expect(busy.status).toBe(503)
    expect(busy.headers.get("Retry-After")).toBe("1")
    expect(busy.headers.get("Cache-Control")).toBe("no-store")
    expect(busy.headers.get("Access-Control-Allow-Origin")).toBe("https://shop.example.com")
    expect(busy.headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(busy.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    expect(await busy.json()).toEqual({error: "event_buffer_full"})

    queue.mockReturnValue(true)
    expect((await collect({request: request()})).status).toBe(202)
    expect(queue).toHaveBeenCalledTimes(3)
  })
})

test("privacy headers do not suppress collection and persistent visitor IDs remain stable", async () => {
  await withCollector(async ({session, queue}) => {
    for (const headers of [{DNT: "1"}, {"Sec-GPC": "1"}] as Record<string, string>[]) {
      expect((await collect({request: request(headers, {v: "visitor-fixture"})})).status).toBe(202)
    }
    expect(queue).toHaveBeenCalledTimes(2)
    expect(session).toHaveBeenCalledTimes(2)
    const first = queue.mock.calls[0][0].userId
    expect(first).toBe(queue.mock.calls[1][0].userId)
    expect(first).not.toBe("visitor-fixture")
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })
})

test("session visitor identity is independent of persistent IDs and visit IDs", async () => {
  await withCollector(async ({queue}) => {
    const headers = {"cf-connecting-ip": "203.0.113.10", "user-agent": "Fixture Browser"}
    await collect({request: request(headers, {v: "persistent-a"})})
    await collect({request: request(headers, {v: "persistent-b"})})
    const first = queue.mock.calls[0][0]
    const second = queue.mock.calls[1][0]
    expect(first.userId).not.toBe(second.userId)
    expect(first.sessionVisitorId).toBe(second.sessionVisitorId)
    expect(first.sessionVisitorId).toMatch(/^[a-f0-9]{64}$/)
    expect(first.sessionVisitorId).not.toBe(first.sessionId)
  })
})

test("invalid payloads and unknown sites do not enqueue analytics", async () => {
  await withCollector(async ({find, session, queue}) => {
    expect((await collect({request: request({}, {n: ""})})).status).toBe(400)
    expect(find).not.toHaveBeenCalled()
    find.mockResolvedValue(null)
    expect((await collect({request: request()})).status).toBe(202)
    expect(session).not.toHaveBeenCalled()
    expect(queue).not.toHaveBeenCalled()
  })
})

test("collector preserves provider geography and uses the proxy peer for lookup", async () => {
  const geo = spyOn(location, "visitorLocation").mockResolvedValue({country:"CN",region:"北京",subdivision:"CN-BJ",city:"北京市"})
  try {
    await withCollector(async ({queue}) => {
      const response = await collect({request: request({"x-forwarded-for":"192.168.1.1, 8.8.8.8", "cf-connecting-ip":"1.1.1.1", "cf-ipcountry":"CN"})})
      expect(response.status).toBe(202)
      expect(geo).toHaveBeenCalledWith("8.8.8.8", "CN")
      expect(queue.mock.calls[0][0]).toMatchObject({country:"CN",region:"北京",subdivision:"CN-BJ",city:"北京市"})
      expect(queue.mock.calls[0][0]).not.toHaveProperty("ip")
    })
  } finally {geo.mockRestore()}
})
