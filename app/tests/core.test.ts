import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { totpCode, verifyTotp } from "../src/lib/totp"
import { isPublicAddress } from "../src/lib/safe-http"
import { eventSchema, monitorSchema, readJson } from "../src/lib/request-validation"
import { dashboardSchema } from "../src/lib/validation"

describe("TOTP", () => {
  const secret = Buffer.from("12345678901234567890")
  test("RFC 6238 SHA1 vectors (six digits)", () => {
    for (const [time, code] of [[59,"287082"],[1111111109,"081804"],[1111111111,"050471"],[1234567890,"005924"],[2000000000,"279037"],[20000000000,"353130"]] as const) expect(totpCode(secret,time)).toBe(code)
  })
  test("rejects a consumed time window", () => {
    const now = Math.floor(Date.now()/1000)
    const code = totpCode(secret, now)
    expect(verifyTotp(secret,code)).not.toBeNull()
    expect(verifyTotp(secret,code,Math.floor(now/30)*30)).toBeNull()
    expect(verifyTotp(secret,"oops")).toBeNull()
  })
})

test("tracker posts to its script host; failed Beacon falls back to fetch", () => {
  const source = readFileSync(new URL('../src/lib/tracking-script.ts', import.meta.url),'utf8')
  const script = vm.runInNewContext('`'+source.match(/const trackingScript = `([\s\S]*?)`\n/)![1]+'`')
  const requests: string[] = []
  const context = { document: {currentScript: {src:'https://stats.example.com/js/script.js', getAttribute:(key: string)=>key==='data-domain'?'shop.example.com':null}, title:'Test', referrer:'', documentElement:{}, addEventListener(){}}, location:{href:'https://shop.example.com/',host:'shop.example.com'}, innerWidth:1200, screen:{width:1200,height:800}, navigator:{language:'zh',sendBeacon:()=>false},fetch:(url:string, options:RequestInit)=>{requests.push(url); expect(options.credentials).toBe("omit"); expect(options.headers).toEqual({"Content-Type":"text/plain;charset=UTF-8"}); return Promise.resolve()}, history:{pushState(){}}, window:{addEventListener(){}}, Blob, URL }
  vm.runInNewContext(script,context)
  expect(requests).toEqual(['https://stats.example.com/api/event'])
})

test("private, loopback, reserved and mapped private IPs are rejected", () => {
  for (const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','0.0.0.0','::1','fc00::1','fe80::1','::ffff:127.0.0.1']) expect(isPublicAddress(ip)).toBe(false)
  expect(isPublicAddress('1.1.1.1')).toBe(true)
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
})

test("runtime schemas reject malformed requests", async () => {
  expect(eventSchema.safeParse(null).success).toBe(false)
  expect(monitorSchema.safeParse({id:'x',secret:'y',metrics:[]} ).success).toBe(false)
  expect(dashboardSchema.safeParse({domain:'x',interval:'injected'}).success).toBe(false)
  await expect(readJson(new Request('http://localhost',{method:'POST',body:'123456'}),3)).rejects.toThrow('请求过大')
})

import { rangeFromSearch, compareRange } from "../src/lib/range"
test("site timezone survives date comparison", () => {
  const range = rangeFromSearch({period: "custom", from: "2026-03-08", to: "2026-03-08"}, "America/New_York")
  expect(range).toEqual({from:"2026-03-08",to:"2026-03-08",timezone:"America/New_York"})
  expect(compareRange(range)).toEqual({from:"2026-03-07",to:"2026-03-07",timezone:"America/New_York"})
})
