import { expect, spyOn, test } from "bun:test"
import { ch, flushEventQueue, queueEvent, type EventPayload } from "../src/lib/ch"

const event = (id: number): EventPayload => ({
  siteId: 1, name: "pageview", hostname: "queue.test", pathname: `/${id}`,
  referrer: "", referrerSource: "Direct", userId: `visitor-${id}`, sessionVisitorId: `monthly-${id}`, sessionId: `session-${id}`,
})
type QueuedRow = {pathname: string; timestamp: number; user_id: string; session_id: string}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2500
  while (!condition() && Date.now() < deadline) await Bun.sleep(5)
  expect(condition()).toBe(true)
  // Let the flush's catch/finally run before the next explicit flush.
  await Bun.sleep(0)
}

async function withQueue(run: (state: {
  batches: QueuedRow[][]; reject: () => void; succeed: () => void;
  failures: ReturnType<typeof spyOn<typeof console, "error">>;
  warnings: ReturnType<typeof spyOn<typeof console, "warn">>;
}) => Promise<void>) {
  const client = ch()
  // Every database operation is intercepted; no database or schema is touched.
  const command = spyOn(client, "command").mockResolvedValue({} as never)
  const failures = spyOn(console, "error").mockImplementation(() => {})
  const warnings = spyOn(console, "warn").mockImplementation(() => {})
  const batches: QueuedRow[][] = []
  let resolve: () => void = () => {}
  let reject: () => void = () => {}
  const insert = spyOn(client, "insert").mockImplementation(async input => {
    batches.push(structuredClone(input.values) as unknown as QueuedRow[])
    await new Promise<void>((ok, fail) => {
      resolve = ok
      reject = () => fail(new Error("simulated ClickHouse failure"))
    })
    return {} as never
  })
  try {
    await run({batches, reject: () => reject(), succeed: () => resolve(), failures, warnings})
  } finally {
    resolve()
    await Bun.sleep(0)
    insert.mockResolvedValue({} as never)
    await flushEventQueue()
    insert.mockRestore()
    command.mockRestore()
    failures.mockRestore()
    warnings.mockRestore()
    await client.close()
  }
}

test("queued events retain country, region and city without storing the client IP", async () => {
  await withQueue(async ({batches, succeed}) => {
    queueEvent({...event(1),country:"CN",region:"北京",subdivision:"CN-BJ",city:"北京市"})
    const flush = flushEventQueue()
    await waitFor(() => batches.length === 1)
    expect(batches[0][0]).toMatchObject({country_code:"CN",region_name:"北京",subdivision1_code:"CN-BJ",city_name:"北京市"})
    expect(batches[0][0]).not.toHaveProperty("ip")
    succeed()
    await flush
  })
})

test("failed batch is retained at exactly 10,000 outstanding events", async () => {
  await withQueue(async ({batches, reject, succeed, failures, warnings}) => {
    for (let id = 0; id < 10_000; id++) expect(queueEvent(event(id))).toBe(true)
    await waitFor(() => batches.length === 1)
    expect(batches[0]).toHaveLength(200)
    reject()
    await waitFor(() => failures.mock.calls.length === 1)
    const retry = flushEventQueue()
    await waitFor(() => batches.length === 2)
    expect(batches[1]).toHaveLength(10_000)
    expect(batches[1].slice(0, 200)).toEqual(batches[0])
    expect(batches[1].map(row => row.pathname)).toEqual(Array.from({length: 10_000}, (_, id) => `/${id}`))
    expect(warnings).not.toHaveBeenCalled()
    succeed()
    await retry
    await flushEventQueue()
    expect(batches).toHaveLength(2)
  })
})

test("in-flight retries reserve capacity through repeated failures and release it on success", async () => {
  await withQueue(async ({batches, reject, succeed, failures, warnings}) => {
    for (let id = 0; id < 10_001; id++) expect(queueEvent(event(id))).toBe(id < 10_000)
    await waitFor(() => batches.length === 1)
    expect(warnings).toHaveBeenCalledTimes(1)
    reject()
    await waitFor(() => failures.mock.calls.length === 1)
    const retry = flushEventQueue()
    await waitFor(() => batches.length === 2)
    for (let id = 10_001; id < 10_201; id++) expect(queueEvent(event(id))).toBe(false)
    expect(warnings).toHaveBeenCalledTimes(201)
    reject()
    await retry
    const recovered = flushEventQueue()
    await waitFor(() => batches.length === 3)
    expect(batches[2]).toEqual(batches[1])
    expect(batches[2]).toHaveLength(10_000)
    succeed()
    await recovered
    expect(queueEvent(event(20_000))).toBe(true)
    const next = flushEventQueue()
    await waitFor(() => batches.length === 4)
    expect(batches[3].map(row => row.pathname)).toEqual(["/20000"])
    succeed()
    await next
  })
})

test("successful writes preserve arrivals during the in-flight batch without resending it", async () => {
  await withQueue(async ({batches, succeed}) => {
    for (let id = 0; id < 200; id++) queueEvent(event(id))
    await waitFor(() => batches.length === 1)
    queueEvent(event(200))
    queueEvent(event(201))
    succeed()
    await Bun.sleep(0)
    const next = flushEventQueue()
    await waitFor(() => batches.length === 2)
    expect(batches[1].map(row => row.pathname)).toEqual(["/200", "/201"])
    succeed()
    await next
  })
})

test("a failed partial batch retries on the timer without new traffic", async () => {
  await withQueue(async ({batches, reject, succeed}) => {
    queueEvent(event(1))
    const first = flushEventQueue()
    await waitFor(() => batches.length === 1)
    reject()
    await first
    await waitFor(() => batches.length === 2)
    expect(batches[1]).toEqual(batches[0])
    succeed()
    await Bun.sleep(0)
  })
})
