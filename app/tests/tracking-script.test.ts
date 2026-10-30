import { describe, expect, test } from "bun:test"
import vm from "node:vm"
import { trackingScript } from "../src/lib/tracking-script"

type Listener = { callback: (event: Record<string, unknown>) => void, once: boolean }
type Payload = { n: string, d: string, u: string, r: string, w: number, v?: string, t: string, l: string, s: string, p?: Record<string, string> }

function tracker(options: { attrs?: Record<string, string>, prerendering?: boolean, fetch?: ((url: string, init: RequestInit) => Promise<Response>) | null, script?: boolean, dnt?:string, gpc?:boolean, storageBlocked?:boolean } = {}) {
  const documentEvents = new Map<string, Listener[]>()
  const windowEvents = new Map<string, Listener[]>()
  const requests: { url: string, init: RequestInit, payload: Payload }[] = []
  const beacons: { url: string, body: Blob }[] = []
  const timers: { delay: number, run: () => void }[] = []
  const location = new URL("https://shop.example.com/start")
  const attributes = { "data-domain": "shop.example.com", ...options.attrs }
  const listen = (events: Map<string, Listener[]>) => (name: string, callback: Listener["callback"], config?: { once?: boolean }) => {
    events.set(name, [...(events.get(name) || []), { callback, once: config?.once === true }])
  }
  const emit = (events: Map<string, Listener[]>, name: string, event: Record<string, unknown> = {}) => {
    for (const listener of events.get(name) || []) {
      if (listener.once) events.set(name, (events.get(name) || []).filter(item => item !== listener))
      listener.callback(event)
    }
  }
  const document = {
    currentScript: options.script === false ? null : {
      src: "https://stats.example.com/script.js",
      getAttribute: (key: string) => attributes[key as keyof typeof attributes] ?? null,
    },
    title: "Shop",
    referrer: "https://www.google.com/search?q=shop",
    prerendering: options.prerendering === true,
    documentElement: {},
    addEventListener: listen(documentEvents),
  }
  const window = {
    addEventListener: listen(windowEvents),
    setTimeout: (run: () => void, delay: number) => { timers.push({ run, delay }) },
    crypto: { randomUUID: () => "generated-visitor" },
    plost: undefined as { track: (name: string, props?: Record<string, unknown>) => void } | undefined,
    litestats: undefined as { track: (name: string, props?: Record<string, unknown>) => void } | undefined,
  }
  const stored = new Map([["litestats:visitor-id", "visitor-fixture"]])
  const localStorage = {
    getItem: (key: string) => { if (options.storageBlocked) throw new Error("blocked"); return stored.get(key) || null },
    setItem: (key: string, value: string) => { if (options.storageBlocked) throw new Error("blocked"); stored.set(key, value) },
  }
  const navigate = (_state: unknown, _title: string, url?: string | URL | null) => {
    if (url != null) location.href = new URL(String(url), location.href).href
    return "history-result"
  }
  const context = {
    document, window, location, localStorage,
    history: { pushState: navigate, replaceState: navigate },
    navigator: { language: "zh-CN", doNotTrack:options.dnt, globalPrivacyControl:options.gpc, sendBeacon: (url: string, body: Blob) => { beacons.push({ url, body }); return true } },
    innerWidth: 320, screen: { width: 320, height: 800 }, Blob, URL,
    fetch: options.fetch === null ? undefined : ((url: string, init: RequestInit) => {
      requests.push({ url, init, payload: JSON.parse(String(init.body)) })
      return options.fetch ? options.fetch(url, init) : Promise.resolve(new Response("ok", { status: 202 }))
    }),
  }
  const run = () => vm.runInNewContext(trackingScript, context)
  run()
  return {
    ...context, requests, beacons, timers, run, stored,
    emitDocument: (name: string, event?: Record<string, unknown>) => emit(documentEvents, name, event),
    emitWindow: (name: string, event?: Record<string, unknown>) => emit(windowEvents, name, event),
    click: (href: string) => emit(documentEvents, "click", { target: { closest: () => ({ href }) } }),
  }
}

async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

describe("browser tracker navigation and installation", () => {
  test("sends one initial pageview with metadata to the script origin", () => {
    const app = tracker()
    expect(app.requests).toHaveLength(1)
    expect(app.beacons).toHaveLength(0)
    expect(app.requests[0]?.url).toBe("https://stats.example.com/api/event")
    expect(app.requests[0]?.init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" } })
    expect(app.requests[0]?.payload).toEqual({ n: "pageview", d: "shop.example.com", u: "https://shop.example.com/start", r: "https://www.google.com/search?q=shop", w: 320, v: "visitor-fixture", t: "Shop", l: "zh-CN", s: "320x800" })
  })

  test("Plost events and the legacy API share visitor identity without duplicate pageviews", () => {
    const app = tracker()
    expect(app.window.plost).toBe(app.window.litestats)
    app.window.plost!.track("Signup", { plan: "pro" })
    app.window.litestats!.track("Legacy signup")
    expect(app.requests.map(request => request.payload.n)).toEqual(["pageview", "Signup", "Legacy signup"])
    expect(app.requests.map(request => request.payload.v)).toEqual(["visitor-fixture", "visitor-fixture", "visitor-fixture"])
    expect(app.requests[1]?.payload.p).toEqual({ plan: "pro" })
    expect(app.stored.get("litestats:visitor-id")).toBe("visitor-fixture")
  })

  test("persistent visitor IDs survive navigation and blocked storage still collects", () => {
    const app = tracker()
    app.history.pushState(null, "", "/pricing")
    expect(app.requests.map(request => request.payload.v)).toEqual(["visitor-fixture", "visitor-fixture"])
    const blocked = tracker({storageBlocked: true})
    expect(blocked.requests).toHaveLength(1)
    expect(blocked.requests[0]?.payload).not.toHaveProperty("v")
  })

  test("duplicate script aliases do not double pageviews, clicks or history wrappers", () => {
    const app = tracker()
    const wrapped = app.history.pushState
    app.document.currentScript!.src = "https://stats.example.com/js/script.js"
    app.run()
    expect(app.history.pushState).toBe(wrapped)
    expect(app.requests).toHaveLength(1)
    app.history.pushState(null, "", "/checkout")
    app.click("https://outside.example.com/")
    expect(app.requests.map(request => request.payload.n)).toEqual(["pageview", "pageview", "Outbound Link: Click"])
  })

  test("same-URL history state and fragment changes do not inflate pageviews", () => {
    const app = tracker()
    app.history.pushState({ open: true }, "", "/start")
    app.history.replaceState({ open: false }, "", "/start#details")
    app.emitWindow("popstate")
    expect(app.requests).toHaveLength(1)
    app.history.pushState(null, "", "/start?plan=pro#details")
    expect(app.requests).toHaveLength(2)
  })

  test("push, replace and back navigation count distinct URLs and preserve the document entry referrer", () => {
    const app = tracker()
    expect(app.history.pushState(null, "", "/pricing")).toBe("history-result")
    expect(app.history.replaceState(null, "", "/checkout")).toBe("history-result")
    app.location.href = "https://shop.example.com/start"
    app.emitWindow("popstate")
    expect(app.requests.map(request => [request.payload.u, request.payload.r])).toEqual([
      ["https://shop.example.com/start", "https://www.google.com/search?q=shop"],
      ["https://shop.example.com/pricing", "https://www.google.com/search?q=shop"],
      ["https://shop.example.com/checkout", "https://www.google.com/search?q=shop"],
      ["https://shop.example.com/start", "https://www.google.com/search?q=shop"],
    ])
  })

  test("a BFCache restoration counts a new view while the initial pageshow does not", () => {
    const app = tracker()
    app.emitWindow("pageshow", { persisted: false })
    expect(app.requests).toHaveLength(1)
    app.emitWindow("pageshow", { persisted: true })
    expect(app.requests).toHaveLength(2)
  })

  test("prerendered documents wait for activation and use the activated URL", () => {
    const app = tracker({ prerendering: true })
    app.history.replaceState(null, "", "/final")
    app.window.litestats!.track("Hidden timer")
    expect(app.requests).toHaveLength(0)
    app.document.prerendering = false
    app.emitDocument("prerenderingchange")
    app.emitDocument("prerenderingchange")
    expect(app.requests).toHaveLength(1)
    expect(app.requests[0]?.payload.u).toBe("https://shop.example.com/final")
    expect(app.requests[0]?.payload.r).toBe(app.document.referrer)
  })

  test("invalid or missing script metadata fails safely", () => {
    expect(tracker({ script: false }).requests).toHaveLength(0)
    expect(tracker({ attrs: { "data-api": "http://[" } }).requests).toHaveLength(0)
    expect(tracker({ attrs: { "data-api": "/collect" } }).requests[0]?.url).toBe("https://stats.example.com/collect")
  })

  test("custom events and automatic outbound/download events retain their payloads", () => {
    const app = tracker()
    app.window.litestats!.track("Signup", { plan: "pro" })
    app.click("https://outside.example.com/report.pdf?download=1")
    expect(app.requests.slice(1).map(request => [request.payload.n, request.payload.p])).toEqual([
      ["Signup", { plan: "pro" }],
      ["Outbound Link: Click", { url: "https://outside.example.com/report.pdf?download=1" }],
      ["File Download", { url: "https://outside.example.com/report.pdf?download=1" }],
    ])
  })

  test("the existing automatic event opt-outs and custom event API remain independent", () => {
    const app = tracker({ attrs: { "data-outbound": "false", "data-file-downloads": "false" } })
    app.click("https://outside.example.com/report.pdf")
    app.window.litestats!.track("Signup")
    expect(app.requests.map(request => request.payload.n)).toEqual(["pageview", "Signup"])
  })
})

describe("browser tracker delivery", () => {
  test.each([{dnt:"1"},{gpc:true}])("privacy preferences do not suppress pageviews or custom events by default", options => {
    for (const fetch of [undefined,null]) {
      const app=tracker({...options,fetch})
      app.window.litestats!.track("Signup")
      app.history.pushState(null,"","/pricing")
      app.click("https://outside.example.com/report.pdf")
      expect(app.requests.length + app.beacons.length).toBe(5)
    }
  })

  test("a privacy change does not suppress an already scheduled retry", async () => {
    const app=tracker({fetch:()=>Promise.resolve(Response.json({error:"event_buffer_full"},{status:503}))})
    await settle()
    expect(app.timers).toHaveLength(1)
    app.navigator.globalPrivacyControl=true
    app.timers.shift()!.run()
    app.window.litestats!.track("Signup")
    await settle()
    expect(app.requests).toHaveLength(3)
  })

  test("only a definite unqueued event retries twice, with the original payload", async () => {
    const app = tracker({ fetch: () => Promise.resolve(Response.json({ error: "event_buffer_full" }, { status: 503 })) })
    await settle()
    expect(app.timers.map(timer => timer.delay)).toEqual([1000])
    app.location.href = "https://shop.example.com/later"
    app.document.title = "Later"
    app.timers.shift()!.run()
    await settle()
    expect(app.timers.map(timer => timer.delay)).toEqual([2000])
    app.timers.shift()!.run()
    await settle()
    expect(app.requests).toHaveLength(3)
    expect(new Set(app.requests.map(request => request.init.body)).size).toBe(1)
    expect(app.requests[2]?.payload.u).toBe("https://shop.example.com/start")
    expect(app.timers).toHaveLength(0)
    expect(app.beacons).toHaveLength(0)
  })

  test.each([
    [202, "ok"],
    [400, "bad request"],
    [500, "internal server error"],
    [503, "proxy unavailable"],
    [503, JSON.stringify({ error: "upstream_unavailable" })],
  ])("does not replay accepted, invalid or ambiguous HTTP %i responses", async (status, body) => {
    const app = tracker({ fetch: () => Promise.resolve(new Response(body, { status })) })
    await settle()
    expect(app.requests).toHaveLength(1)
    expect(app.timers).toHaveLength(0)
    expect(app.beacons).toHaveLength(0)
  })

  test("does not replay an uncertain network failure through Beacon", async () => {
    const app = tracker({ fetch: () => Promise.reject(new Error("connection lost")) })
    await settle()
    expect(app.requests).toHaveLength(1)
    expect(app.timers).toHaveLength(0)
    expect(app.beacons).toHaveLength(0)
  })

  test("uses a single Beacon in browsers without fetch", async () => {
    const app = tracker({ fetch: null })
    expect(app.requests).toHaveLength(0)
    expect(app.beacons).toHaveLength(1)
    expect(app.beacons[0]?.url).toBe("https://stats.example.com/api/event")
    expect(JSON.parse(await app.beacons[0]!.body.text()).n).toBe("pageview")
  })
})
