import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { renderToStaticMarkup } from "react-dom/server"
import { AccentPicker } from "../src/components/AccentPicker"
import { ACCENT_BOOTSTRAP_SCRIPT, ACCENT_CHOICES, readAccentColor, setAccentColor, subscribeAccentColor } from "../src/lib/accent-preference"
import { I18nProvider } from "../src/lib/i18n"

test("the early bootstrap restores every color and leaves dark mode independent", () => {
  for (const { value } of ACCENT_CHOICES) {
    const dataset = { theme: "dark", accent: "purple" }
    const keys: string[] = []
    runInNewContext(ACCENT_BOOTSTRAP_SCRIPT, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: (key: string) => { keys.push(key); return value } },
    })
    expect(keys).toEqual(["litestats:accent"])
    expect(dataset).toEqual({ theme: "dark", accent: value })
  }
})

test("missing, malformed and unavailable storage cannot inject a color or break bootstrap", () => {
  for (const value of [null, "", "navy", "Blue", "__proto__", '</script><script>alert(1)</script>']) {
    const dataset: Record<string, string> = {}
    runInNewContext(ACCENT_BOOTSTRAP_SCRIPT, { document: { documentElement: { dataset } }, localStorage: { getItem: () => value } })
    expect(dataset.accent).toBe("purple")
  }
  const dataset: Record<string, string> = {}
  runInNewContext(ACCENT_BOOTSTRAP_SCRIPT, {
    document: { documentElement: { dataset } },
    get localStorage() { throw new Error("Storage unavailable") },
  })
  expect(dataset.accent).toBe("purple")
})

test("color changes persist immediately, synchronize tabs, and still apply if storage is blocked", () => {
  const descriptors = Object.fromEntries(["document", "window", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const dataset = { accent: "purple", theme: "dark" }
  const favicon = {
    href: "/favicon.svg?v=5",
    getAttribute: (name: string) => name === "href" ? favicon.href : null,
    setAttribute: (name: string, value: string) => { if (name === "href") favicon.href = value },
  }
  const browser = new EventTarget()
  const values = new Map<string, string>()
  let blocked = false
  const storage = { setItem: (key: string, value: string) => { if (blocked) throw new Error("Blocked"); values.set(key, value) } }
  const dispatchStorage = (key: string | null, newValue: string | null, storageArea: unknown = storage) => {
    const event = new Event("storage")
    Object.assign(event, {key, newValue, storageArea})
    browser.dispatchEvent(event)
  }
  let stop: (() => void) | undefined
  try {
    for (const [key, value] of Object.entries({ document: {documentElement: {dataset}, getElementById: (id: string) => id === "app-favicon" ? favicon : null}, window: browser, localStorage: storage })) {
      Object.defineProperty(globalThis, key, {configurable: true, value})
    }
    let notifications = 0
    stop = subscribeAccentColor(() => { notifications++ })
    expect(setAccentColor("blue")).toBe(true)
    expect(readAccentColor()).toBe("blue")
    expect(favicon.href).toBe("/favicon-blue.svg?v=5")
    expect(values.get("litestats:accent")).toBe("blue")
    expect(notifications).toBe(1)
    dispatchStorage("litestats:accent", "black")
    expect(readAccentColor()).toBe("black")
    expect(favicon.href).toBe("/favicon-black.svg?v=5")
    dispatchStorage("unrelated", "green")
    dispatchStorage("litestats:accent", "green", {})
    expect(readAccentColor()).toBe("black")
    expect(favicon.href).toBe("/favicon-black.svg?v=5")
    expect(notifications).toBe(2)
    dispatchStorage("litestats:accent", "invalid")
    expect(readAccentColor()).toBe("purple")
    expect(favicon.href).toBe("/favicon.svg?v=5")
    dispatchStorage("litestats:accent", "green")
    expect(readAccentColor()).toBe("green")
    expect(favicon.href).toBe("/favicon-green.svg?v=5")
    dispatchStorage(null, null)
    expect(readAccentColor()).toBe("purple")
    expect(favicon.href).toBe("/favicon.svg?v=5")
    blocked = true
    expect(setAccentColor("green")).toBe(false)
    expect(readAccentColor()).toBe("green")
    expect(favicon.href).toBe("/favicon-green.svg?v=5")
    expect(values.get("litestats:accent")).toBe("blue")
    expect(dataset.theme).toBe("dark")
    const beforeStop = notifications
    stop()
    dispatchStorage("litestats:accent", "black")
    expect(readAccentColor()).toBe("green")
    expect(favicon.href).toBe("/favicon-green.svg?v=5")
    expect(notifications).toBe(beforeStop)
  } finally {
    stop?.()
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test("color choices have native radio labels and a stable server-rendered default", () => {
  const html = renderToStaticMarkup(<I18nProvider locale="zh-CN"><AccentPicker /></I18nProvider>)
  expect(html).toContain("<legend")
  expect(html).toContain("界面配色")
  expect(html.match(/type="radio"/g)).toHaveLength(4)
  expect(html.match(/checked=""/g)).toHaveLength(1)
  expect(html.match(/<input[^>]+>/g)?.find(input => input.includes('value="purple"'))).toContain('checked=""')
  expect(html).toContain("立即生效，保存在当前浏览器。")
  expect(html).not.toContain('type="submit"')
  const english = renderToStaticMarkup(<I18nProvider locale="en"><AccentPicker /></I18nProvider>)
  expect(english).toContain("Interface color")
  expect(english).toContain("Black")
})
