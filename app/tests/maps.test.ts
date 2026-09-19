import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { googleMapDocument } from "../src/lib/google-map-document"
import { mapSettingsSchema } from "../src/lib/map-validation"

test("map settings validate provider, require a Google key, and allow clearing it", () => {
  expect(mapSettingsSchema.safeParse({domain:"demo.test", provider:"google", apiKey:""}).success).toBe(false)
  expect(mapSettingsSchema.safeParse({domain:"demo.test", provider:"other", apiKey:"abc"}).success).toBe(false)
  expect(mapSettingsSchema.safeParse({domain:"demo.test", provider:"google", apiKey:'abc<script>'}).success).toBe(false)
  expect(mapSettingsSchema.parse({domain:"demo.test", provider:"default", apiKey:""}).apiKey).toBe("")
})

test("embedded map safely serializes data and reports loading/auth failures", () => {
  const html = googleMapDocument({apiKey:"TEST_NOT_A_REAL_KEY", locale:"en", dark:false, origin:"https://stats.example", points:[{code:"US",name:'</script><script>alert(1)</script>',count:10,percent:"100",lat:37,lng:-95}]})
  expect(html.match(/<script>/g)?.length).toBe(1)
  const code = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"))
  const messages: unknown[] = []
  let script: {src?:string,onerror?:()=>void} = {}
  const window: {gm_authFailure?:()=>void} = {}
  runInNewContext(code, {window, parent:{postMessage:(message:unknown, origin:string)=>messages.push({message,origin})}, URLSearchParams,
    document:{createElement:()=>script={},head:{append:()=>{}}}})
  expect(script.src).toContain("https://maps.googleapis.com/maps/api/js?")
  expect(script.src).toContain("language=en")
  script.onerror?.(); window.gm_authFailure?.()
  expect(messages).toEqual(Array(2).fill({message:{source:"litestats-google-map",type:"error",code:undefined},origin:"https://stats.example"}))
})

test("Mapbox rejects secret tokens and requires a valid custom style", () => {
  const base = {domain:"demo.test",provider:"mapbox",apiKey:"",mapboxToken:"pk.test",mapboxStyle:"light"}
  expect(mapSettingsSchema.safeParse(base).success).toBe(true)
  expect(mapSettingsSchema.safeParse({...base,mapboxToken:"sk.secret"}).success).toBe(false)
  expect(mapSettingsSchema.safeParse({...base,mapboxToken:""}).success).toBe(false)
  expect(mapSettingsSchema.safeParse({...base,mapboxStyle:"custom"}).success).toBe(false)
  expect(mapSettingsSchema.safeParse({...base,mapboxStyle:"custom",mapboxCustomStyle:"https://other.example/style.json"}).success).toBe(false)
  expect(mapSettingsSchema.safeParse({...base,mapboxStyle:"custom",mapboxCustomStyle:"mapbox://styles/owner/style-id"}).success).toBe(true)
})

test("Mapbox themes resolve and SDK errors reach the parent", async () => {
  const {mapboxStyleUrl} = await import("../src/lib/map-options")
  const {mapboxMapDocument} = await import("../src/lib/mapbox-map-document")
  expect(mapboxStyleUrl("auto","",true)).toBe("mapbox://styles/mapbox/dark-v11")
  expect(mapboxStyleUrl("auto","",false)).toBe("mapbox://styles/mapbox/light-v11")
  expect(mapboxStyleUrl("custom","mapbox://styles/me/test",false)).toBe("mapbox://styles/me/test")
  const html = mapboxMapDocument({token:"pk.test",style:"streets",customStyle:"",locale:"en",dark:false,origin:"https://stats.example",points:[]})
  const code = html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"))
  const events:unknown[]=[]
  let script:{onerror?:()=>void,onload?:()=>void}={}
  runInNewContext(code,{parent:{postMessage:(data:unknown)=>events.push(data)},document:{createElement:()=>script={},head:{append:()=>{}}},mapboxgl:{supported:()=>false}})
  script.onerror?.();script.onload?.()
  expect(events).toEqual(Array(2).fill({source:"litestats-mapbox-map",type:"error",code:undefined}))
})

test("Google presets follow system mode only for auto and validate stored choices", async () => {
  const {googleMapStyles} = await import("../src/lib/google-map-styles")
  expect(googleMapStyles("auto",true)).toEqual(googleMapStyles("dark",false))
  expect(googleMapStyles("auto",false)).toEqual(googleMapStyles("aqua",true))
  expect(googleMapStyles("standard",true)).toEqual([])
  expect(googleMapStyles("silver",true)).toEqual(googleMapStyles("silver",false))
  expect(mapSettingsSchema.safeParse({domain:"demo.test",provider:"default",apiKey:"",googleStyle:"unknown"}).success).toBe(false)
})
