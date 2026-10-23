import {createFileRoute} from "@tanstack/react-router"
import {db} from "~/lib/db"
import {ch,ensureEventColumns} from "~/lib/ch"

export const Route=createFileRoute("/api/health")({server:{handlers:{GET:async()=>{
  try {
    await Promise.all([(await db()).query("SELECT 1"),ensureEventColumns().then(()=>ch().query({query:"SELECT 1",format:"JSONEachRow"}).then(result=>result.json()))])
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}})
  } catch {return Response.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}})}
}}}})
