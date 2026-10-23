import {request as httpRequest} from "node:http"
import {Readable,Transform} from "node:stream"
import {pipeline} from "node:stream/promises"
import {requireAdmin} from "./session"
import {db,verifyPassword} from "./db"
import {drainEventQueue} from "./ch"
import {holdMaintenance} from "./maintenance"
import {createInstanceBackupHandler} from "./instance-backup-handler"

async function agent(path:string,options:{method?:string;body?:BodyInit|null;headers?:Record<string,string>}={}){
  const socketPath=process.env.LITESTATS_OPS_SOCKET, token=process.env.LITESTATS_OPS_TOKEN
  if(!socketPath||!token)throw new Error("Operations unavailable")
  return new Promise<Response>((resolve,reject)=>{
    const body=typeof options.body==="string"?Buffer.from(options.body):null
    const upload=options.body instanceof ReadableStream?options.body:null
    const headers:Record<string,string>={Authorization:`Bearer ${token}`,...options.headers}
    if(body){headers["Content-Length"]=String(body.byteLength);headers["Content-Type"]="application/json"}
    const outgoing=httpRequest({socketPath,path,method:options.method||"GET",headers},incoming=>{
      const responseHeaders=new Headers({"Cache-Control":"no-store"})
      for(const key of ["content-type","content-length","content-disposition"]){const value=incoming.headers[key];if(typeof value==="string")responseHeaders.set(key,value)}
      incoming.on("error",reject)
      resolve(new Response(Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>,{status:incoming.statusCode||502,headers:responseHeaders}))
    })
    outgoing.setTimeout(120_000,()=>outgoing.destroy(new Error("Operations timeout")))
    outgoing.on("error",reject)
    if(upload){
      let size=0;const expected=Number(headers["Content-Length"])
      const bound=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;callback(size>expected?new Error("Upload too large"):null,chunk)},flush(callback){callback(size===expected?null:new Error("Incomplete upload"))}})
      void pipeline(Readable.fromWeb(upload as unknown as import("node:stream/web").ReadableStream),bound,outgoing).catch(reject)
    }else outgoing.end(body||undefined)
  })
}

export const instanceBackupHandler=createInstanceBackupHandler({admin:requireAdmin,password:verifyPassword,agent,hold:async()=>{
  const client=await(await db()).connect()
  let release:(()=>void)|undefined
  try{
    const result=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(817325) AS locked")
    if(!result.rows[0].locked)throw new Error("Another backup is running")
    release=await holdMaintenance()
    await drainEventQueue()
    return ()=>{release?.();void client.query("SELECT pg_advisory_unlock(817325)").then(()=>client.release(),()=>client.release(true))}
  }catch(error){release?.();try{await client.query("SELECT pg_advisory_unlock(817325)")}finally{client.release()}throw error}
}})
