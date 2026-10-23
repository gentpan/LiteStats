import {expect,test} from "bun:test"
import {enterRequest,enterBackgroundJob,withMaintenance} from "../src/lib/maintenance"

test("maintenance rejects new requests and workers, waits for existing work and always resumes",async()=>{
 const request=enterRequest()!,worker=enterBackgroundJob()!
 let started=false
 const operation=withMaintenance(async()=>{started=true;expect(enterRequest()).toBeNull();throw new Error("fixture failure")},0)
 expect(enterRequest()).toBeNull()
 expect(enterBackgroundJob()).toBeNull()
 await expect(withMaintenance(async()=>{})).rejects.toThrow("正在执行")
 expect(started).toBe(false)
 request();request();worker()
 await expect(operation).rejects.toThrow("fixture failure")
 const resumed=enterRequest()
 expect(resumed).not.toBeNull();resumed!()
})

test("Nitro and SSR copies share the same maintenance gate",async()=>{
 const url=new URL("../src/lib/maintenance.ts",import.meta.url).href+"?separate-bundle"
 const copy=await import(url) as typeof import("../src/lib/maintenance")
 await withMaintenance(async()=>{expect(copy.enterRequest()).toBeNull();expect(copy.enterBackgroundJob()).toBeNull()})
 const released=copy.enterRequest();expect(released).not.toBeNull();released!()
})
