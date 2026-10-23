import {expect,test} from "bun:test"
import {createInstanceBackupHandler} from "../src/lib/instance-backup-handler"
const id="a".repeat(32),ticket="b".repeat(43),base="https://stats.example/api/instance-backups"
function request(action:string,body?:unknown,headers:Record<string,string>={}){return new Request(`${base}?action=${action}`,body===undefined?{headers}:{method:"POST",headers:{Origin:"https://stats.example","Content-Type":"application/json",...headers},body:JSON.stringify(body)})}
function setup(admin=true){
 const calls:{path:string;body?:BodyInit|null}[]=[]
 const handler=createInstanceBackupHandler({admin:async()=>{if(!admin)throw new Error("secret authentication details");return{id:992}},password:async(_id,value)=>value==="fixture-password",hold:async()=>()=>{},agent:async(path,options)=>{calls.push({path,body:options?.body});return Response.json({id,ticket,state:"prepared",kind:"backup"})}})
 return{handler,calls}
}
test("all archive, upload and key operations require an administrator",async()=>{
 const {handler,calls}=setup(false)
 for(const action of ["list","archive","upload","prepare","activate","key"]){const response=await handler(request(action,action==="list"||action==="archive"?undefined:{}));expect(response.status).toBe(403);expect(await response.text()).not.toContain("secret authentication")}
 expect(calls.length).toBe(0)
})
test("job tickets permit status only, without the old restored session",async()=>{
 const {handler,calls}=setup(false)
 expect((await handler(request(`status&id=${id}`))).status).toBe(403)
 expect((await handler(request(`status&id=${id}`,undefined,{"X-Backup-Ticket":ticket}))).status).toBe(200)
 expect(calls[0].path).toBe(`/status?id=${id}`)
 expect((await handler(request("archive&id=fixture.lsb",undefined,{"X-Backup-Ticket":ticket}))).status).toBe(403)
})
test("cross-origin mutations, traversal and oversized uploads are rejected",async()=>{
 const {handler,calls}=setup()
 expect((await handler(request("prepare",{kind:"backup"},{Origin:"https://evil.example"}))).status).toBe(403)
 expect((await handler(request("archive&id=../private.env"))).status).toBe(400)
 expect((await handler(request("upload",{}, {"Content-Length":String(11*1024**3)}))).status).toBe(400)
 expect(calls.length).toBe(0)
})
test("restore and key download require current password, and only validated fields reach the broker",async()=>{
 const {handler,calls}=setup()
 expect((await handler(request("prepare",{kind:"restore",archive:"fixture.lsb",password:"wrong",confirmation:"RESTORE"}))).status).toBe(403)
 expect((await handler(request("prepare",{kind:"restore",archive:"fixture.lsb",password:"fixture-password"}))).status).toBe(400)
 expect((await handler(request("prepare",{kind:"restore",archive:"fixture.lsb",password:"fixture-password",confirmation:"RESTORE",command:"do-not-forward"}))).status).toBe(201)
 const body=String(calls[0].body);expect(body).not.toContain("fixture-password");expect(body).not.toContain("do-not-forward");expect(JSON.parse(body).kind).toBe("restore")
 expect((await handler(request("key",{password:"fixture-password"}))).status).toBe(200)
 expect(calls[1].path).toBe("/key")
})
test("backup progress UI exposes a full local workflow before optional cloud storage",async()=>{
 const source=await Bun.file(new URL("../src/components/BackupPanel.tsx",import.meta.url)).text()
 expect(source.indexOf("<FullBackupPanel")).toBeLessThan(source.indexOf("<SettingsForm"))
 const ui=await Bun.file(new URL("../src/components/FullBackupPanel.tsx",import.meta.url)).text()
 expect(ui).toContain('sessionStorage.setItem(storageKey,JSON.stringify({id:prepared.id,ticket:prepared.ticket}))')
 expect(ui).not.toContain('localStorage')
 expect(ui).toContain('pattern="RESTORE"')
})
