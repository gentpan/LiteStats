import {definePlugin} from "nitro"
import {enterRequest} from "../../src/lib/maintenance"

export default definePlugin(app=>{
  // Request-hook failures are swallowed by Nitro; guard the actual fetch handler.
  const handle=app.fetch
  app.fetch=async request=>{
    const url=new URL(request.url)
    // Status requires an unguessable per-job ticket, even after recovery changes sessions.
    if(request.method==="GET" && url.pathname==="/api/instance-backups" && url.searchParams.get("action")==="status")return handle(request)
    const release=enterRequest()
    if(!release)return Response.json({error:"Backup or restore in progress"},{status:503,headers:{"Retry-After":"30","Cache-Control":"no-store"}})
    try{return await handle(request)} finally{release()}
  }
})
