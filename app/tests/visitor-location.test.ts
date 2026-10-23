import { afterEach, expect, spyOn, test } from "bun:test"
import { parseVisitorLocation, visitorAddress, visitorLocation } from "../src/lib/visitor-location"

const original = process.env.GEOIP_PROVIDER
let network: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined
afterEach(() => {
  network?.mockRestore(); network = undefined
  if (original === undefined) delete process.env.GEOIP_PROVIDER
  else process.env.GEOIP_PROVIDER = original
})

test("the proxy's final peer wins over spoofed client geography headers", () => {
  expect(visitorAddress(new Headers({"x-forwarded-for":"10.0.0.1, 8.8.8.8", "cf-connecting-ip":"1.1.1.1", "x-real-ip":"9.9.9.9"}))).toBe("8.8.8.8")
})

test("provider parsing retains only country, region, subdivision and city", () => {
  expect(parseVisitorLocation({ip:"8.8.8.8",country_code:"cn",province:"北京",city:"北京市",latitude:"39",asn:"AS123"})).toEqual({country:"CN",region:"北京",subdivision:"CN-BJ",city:"北京市"})
  expect(parseVisitorLocation({country_code:"US",region:"California",city:"Mountain View"})).toEqual({country:"US",region:"California",subdivision:"US-CA",city:"Mountain View"})
  expect(parseVisitorLocation({country_code:"not-a-country"})).toEqual({country:"",region:"",subdivision:"",city:""})
})

test("disabled lookup and private, loopback or malformed addresses never leave the server", async () => {
  network = spyOn(globalThis,"fetch").mockRejectedValue(new Error("Unexpected network"))
  process.env.GEOIP_PROVIDER = "off"
  expect((await visitorLocation("8.8.8.8","cn")).country).toBe("CN")
  process.env.GEOIP_PROVIDER = "cnip"
  for (const ip of ["127.0.0.1","10.1.2.3","::1","::ffff:192.168.1.1","169.254.169.254","not-an-ip","8.8.8.8/../../private"]) {
    expect((await visitorLocation(ip,"US")).country).toBe("US")
  }
  expect(network).not.toHaveBeenCalled()
})

test("same-IP requests share a bounded lookup and cache the result without repeating calls", async () => {
  process.env.GEOIP_PROVIDER = "cnip"
  network = spyOn(globalThis,"fetch").mockImplementation(Object.assign(async () => Response.json({country_code:"UZ",region:"Tashkent",city:"Tashkent"}), {preconnect() {}}))
  const results = await Promise.all([visitorLocation("9.9.9.9"),visitorLocation("9.9.9.9")])
  expect(results[0]).toEqual({country:"UZ",region:"Tashkent",subdivision:"UZ-TK",city:"Tashkent"})
  expect(results[1]).toEqual(results[0])
  expect(await visitorLocation("9.9.9.9")).toEqual(results[0])
  expect(network).toHaveBeenCalledTimes(1)
  expect(String(network.mock.calls[0][0])).toBe("https://api.cnip.io/geoip/9.9.9.9")
})

test("failed lookup retains the country hint and negative caching prevents repeated failures", async () => {
  process.env.GEOIP_PROVIDER = "cnip"
  network = spyOn(globalThis,"fetch").mockRejectedValue(new Error("Provider unavailable"))
  expect(await visitorLocation("1.0.0.1","CN")).toEqual({country:"CN",region:"",subdivision:"",city:""})
  expect((await visitorLocation("1.0.0.1","US")).country).toBe("US")
  expect(network).toHaveBeenCalledTimes(1)
})

test("concurrent provider requests are capped and excess events keep their country hint", async () => {
  process.env.GEOIP_PROVIDER = "cnip"
  const release: Array<() => void> = []
  network = spyOn(globalThis,"fetch").mockImplementation(Object.assign(() => new Promise<Response>(resolve => {release.push(() => resolve(Response.json({country_code:"US",region:"California",city:"Mountain View"})))}), {preconnect() {}}))
  const work = Array.from({length:8}, (_,index) => visitorLocation(`8.34.210.${index + 1}`))
  expect((await visitorLocation("8.34.210.9","CA")).country).toBe("CA")
  expect(network).toHaveBeenCalledTimes(8)
  release.forEach(resolve => resolve())
  expect((await Promise.all(work)).every(result => result.country === "US")).toBe(true)
})

test("provider timeout resolves safely and the response size is bounded", async () => {
  process.env.GEOIP_PROVIDER = "cnip"
  network = spyOn(globalThis,"fetch").mockImplementation(Object.assign((_url: Parameters<typeof fetch>[0], options: Parameters<typeof fetch>[1]) => new Promise<Response>((_ok, fail) => options!.signal!.addEventListener("abort", () => fail(new Error("Aborted")), {once:true})), {preconnect() {}}))
  expect((await visitorLocation("8.8.4.4","US")).country).toBe("US")
  network.mockResolvedValue(new Response("x".repeat(16385)))
  expect((await visitorLocation("1.1.1.1","CN")).country).toBe("CN")
})
