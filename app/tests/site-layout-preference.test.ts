import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import {
  SITE_LAYOUT_BOOTSTRAP_SCRIPT,
  readSiteLayout,
  setSiteLayout,
  subscribeSiteLayout,
} from "../src/lib/site-layout-preference"

test("site layout bootstrap restores both layouts without changing color or dark mode", () => {
  for (const value of ["list", "grid"]) {
    const dataset = { theme: "dark", accent: "green", siteLayout: "list" }
    const keys: string[] = []
    runInNewContext(SITE_LAYOUT_BOOTSTRAP_SCRIPT, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: (key: string) => { keys.push(key); return value } },
    })
    expect(keys).toEqual(["litestats:site-layout"])
    expect(dataset).toEqual({ theme: "dark", accent: "green", siteLayout: value })
  }
})

test("invalid or blocked storage retains the existing list default before hydration", () => {
  for (const value of [null, "", "cards", "GRID", "__proto__", '</script><script>alert(1)</script>']) {
    const dataset: Record<string, string> = {}
    runInNewContext(SITE_LAYOUT_BOOTSTRAP_SCRIPT, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: () => value },
    })
    expect(dataset.siteLayout).toBe("list")
  }
  const dataset: Record<string, string> = {}
  runInNewContext(SITE_LAYOUT_BOOTSTRAP_SCRIPT, {
    document: { documentElement: { dataset } },
    get localStorage() { throw new Error("Storage unavailable") },
  })
  expect(dataset.siteLayout).toBe("list")
})

// Keep these browser stubs synchronous and restore every descriptor even when an
// assertion fails; the rest of the suite also renders UI on the server.
function withBrowser(run: (browser: EventTarget, dataset: Record<string, string>, storage: StorageStub) => void) {
  const descriptors = Object.fromEntries(["document", "window", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const dataset: Record<string, string> = { theme: "dark", accent: "green", siteLayout: "list" }
  const browser = new EventTarget()
  const values = new Map<string, string>()
  const storage = {
    values,
    blocked: false,
    setItem(key: string, value: string) {
      if (this.blocked) throw new Error("Storage unavailable")
      values.set(key, value)
    },
  }
  try {
    for (const [key, value] of Object.entries({ document: { documentElement: { dataset } }, window: browser, localStorage: storage })) {
      Object.defineProperty(globalThis, key, { configurable: true, value })
    }
    run(browser, dataset, storage)
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

type StorageStub = {
  values: Map<string, string>
  blocked: boolean
  setItem(key: string, value: string): void
}

test("server rendering and malformed DOM values return a stable list snapshot", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document")
  try {
    Reflect.deleteProperty(globalThis, "document")
    expect(readSiteLayout()).toBe("list")
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor)
  }
  withBrowser((_browser, dataset) => {
    for (const value of ["list", "grid"] as const) {
      dataset.siteLayout = value
      expect(readSiteLayout()).toBe(value)
    }
    for (const value of ["", "GRID", "other", "__proto__"]) {
      dataset.siteLayout = value
      expect(readSiteLayout()).toBe("list")
    }
    delete dataset.siteLayout
    expect(readSiteLayout()).toBe("list")
  })
})

test("layout changes persist and notify while blocked storage still permits local switching", () => {
  withBrowser((browser, dataset, storage) => {
    let changes = 0
    const stop = subscribeSiteLayout(() => { changes++ })
    try {
      expect(setSiteLayout("grid")).toBe(true)
      expect(readSiteLayout()).toBe("grid")
      expect(storage.values.get("litestats:site-layout")).toBe("grid")
      expect(changes).toBe(1)
      storage.blocked = true
      expect(setSiteLayout("list")).toBe(false)
      expect(readSiteLayout()).toBe("list")
      expect(storage.values.get("litestats:site-layout")).toBe("grid")
      expect(changes).toBe(2)
      expect(dataset.theme).toBe("dark")
      expect(dataset.accent).toBe("green")
      stop()
      browser.dispatchEvent(new Event("litestats:site-layout-change"))
      expect(changes).toBe(2)
    } finally { stop() }
  })
})

test("other tabs synchronize layout; unrelated and session storage events are ignored", () => {
  withBrowser((browser, dataset, storage) => {
    const dispatchStorage = (key: string | null, newValue: string | null, storageArea: unknown = storage) => {
      const event = new Event("storage")
      Object.assign(event, { key, newValue, storageArea })
      browser.dispatchEvent(event)
    }
    let changes = 0
    const stop = subscribeSiteLayout(() => { changes++ })
    try {
      dispatchStorage("litestats:site-layout", "grid")
      expect(readSiteLayout()).toBe("grid")
      expect(changes).toBe(1)
      dispatchStorage("litestats:accent", "blue")
      dispatchStorage("litestats:site-layout", "list", {})
      expect(readSiteLayout()).toBe("grid")
      expect(changes).toBe(1)
      dispatchStorage("litestats:site-layout", "malformed")
      expect(readSiteLayout()).toBe("list")
      dispatchStorage("litestats:site-layout", "grid")
      dispatchStorage(null, null)
      expect(readSiteLayout()).toBe("list")
      expect(changes).toBe(4)
      expect(dataset.theme).toBe("dark")
      expect(dataset.accent).toBe("green")
      stop()
      dispatchStorage("litestats:site-layout", "grid")
      expect(readSiteLayout()).toBe("list")
      expect(changes).toBe(4)
    } finally { stop() }
  })
})
