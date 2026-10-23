import {readJson} from "./request-validation"
import type {FullBackupJob} from "./instance-backup-types"

type Agent=(path:string,options?:{method?:string;body?:BodyInit|null;headers?:Record<string,string>})=>Promise<Response>
type Dependencies={admin:()=>Promise<{id:number}>;password:(id:number,password:string)=>Promise<boolean>;agent:Agent;hold:()=>Promise<()=>void>}
const noStore={"Cache-Control":"no-store"}
const maximum=10*1024**3
const identifier=/^[a-f0-9]{32}$/
const ticketPattern=/^[A-Za-z0-9_-]{40,64}$/
const archive=/^[A-Za-z0-9_-]+\.lsb$/
const failures=new Map<number,{count:number;until:number}>()
class RequestError extends Error {constructor(message:string,readonly status=400){super(message)}}
async function json<T>(response:Response):Promise<T>{
  if(!response.ok)throw new RequestError("备份服务无法完成请求，请检查文件或稍后重试",502)
  return response.json() as Promise<T>
}

export function createInstanceBackupHandler(deps:Dependencies){
  return async(request:Request):Promise<Response>=>{
    try{
      const url=new URL(request.url), action=url.searchParams.get("action") || "list"
      if(request.method==="GET" && action==="status"){
        const id=url.searchParams.get("id")||"", ticket=request.headers.get("X-Backup-Ticket")||""
        if(!identifier.test(id)||!ticketPattern.test(ticket))throw new RequestError("无效的备份进度凭证",403)
        return Response.json(await json(await deps.agent(`/status?id=${id}`,{headers:{"X-Job-Ticket":ticket}})),{headers:noStore})
      }
      let user:{id:number}
      try{user=await deps.admin()}catch{throw new RequestError("需要实例管理员登录",403)}
      if(request.method==="GET"){
        if(action==="list")return Response.json(await json(await deps.agent("/list")),{headers:noStore})
        if(action==="archive"){
          const id=url.searchParams.get("id")||""
          if(!archive.test(id))throw new RequestError("无效的备份文件")
          return deps.agent(`/archive?id=${encodeURIComponent(id)}`)
        }
        throw new RequestError("无效的备份操作")
      }
      if(request.method!=="POST")throw new RequestError("无效的备份操作",405)
      if(request.headers.get("Origin")!==url.origin || request.headers.get("Sec-Fetch-Site")==="cross-site")throw new RequestError("请从本后台发起操作",403)
      if(action==="upload"){
        const size=Number(request.headers.get("Content-Length"))
        if(!Number.isSafeInteger(size)||size<82||size>maximum || !request.body)throw new RequestError("请选择小于 10 GB 的完整 .lsb 备份文件")
        return Response.json(await json(await deps.agent("/upload",{method:"POST",body:request.body,headers:{"Content-Length":String(size)}})),{headers:noStore,status:201})
      }
      const input=await readJson(request,16384) as Record<string,unknown>
      if(action==="key" || (action==="prepare" && input.kind==="restore")){
        const attempt=failures.get(user.id)
        if(attempt && attempt.until>Date.now() && attempt.count>=5)throw new RequestError("密码尝试过多，请五分钟后重试",429)
        if(typeof input.password!=="string"||input.password.length>256 || !await deps.password(user.id,input.password)){
          const recent=attempt && attempt.until>Date.now()?attempt:{count:0,until:Date.now()+300_000}
          recent.count++;failures.set(user.id,recent)
          throw new RequestError("管理员密码不正确",403)
        }
        failures.delete(user.id)
        if(action==="key")return deps.agent("/key")
        if(input.confirmation!=="RESTORE")throw new RequestError("请输入 RESTORE 确认恢复")
      }
      if(action==="prepare"){
        if(!["backup","verify","restore"].includes(String(input.kind)))throw new RequestError("无效的备份操作")
        if(input.kind!=="backup" && (typeof input.archive!=="string"||!archive.test(input.archive)))throw new RequestError("无效的备份文件")
        if(input.recoveryKey!==undefined && (typeof input.recoveryKey!=="string" || input.recoveryKey.length>512))throw new RequestError("无效的恢复密钥")
        const body=JSON.stringify({kind:input.kind,archive:input.archive,recoveryKey:input.recoveryKey})
        return Response.json(await json(await deps.agent("/prepare",{method:"POST",body})),{headers:noStore,status:201})
      }
      if(action==="activate"){
        if(typeof input.id!=="string"||!identifier.test(input.id)||typeof input.ticket!=="string"||!ticketPattern.test(input.ticket))throw new RequestError("无效的备份进度凭证",403)
        const job=await json<FullBackupJob>(await deps.agent(`/status?id=${input.id}`,{headers:{"X-Job-Ticket":input.ticket}}))
        if(job.state!=="prepared")return Response.json(job,{headers:noStore})
        const release=job.kind==="verify"?()=>{}:await deps.hold()
        try{
          const response=await json<FullBackupJob>(await deps.agent("/activate",{method:"POST",body:JSON.stringify({id:input.id,ticket:input.ticket})}))
          if(response.state!=="running"){release();return Response.json(response,{headers:noStore})}
          // The broker may stop this process. If it doesn't, terminal status releases the gate.
          const timer=setInterval(async()=>{
            try{
              const current=await json<FullBackupJob>(await deps.agent(`/status?id=${input.id}`,{headers:{"X-Job-Ticket":String(input.ticket)}}))
              if(current.state==="succeeded"||current.state==="failed"){clearInterval(timer);release()}
            }catch{/* Keep writes paused until the operator confirms the job has ended. */}
          },1000)
          timer.unref?.()
          return Response.json(response,{headers:noStore,status:202})
        }catch(error){release();throw error}
      }
      throw new RequestError("无效的备份操作")
    }catch(error){
      return Response.json({error:error instanceof RequestError?error.message:"完整备份服务暂不可用，请稍后重试"},{status:error instanceof RequestError?error.status:503,headers:noStore})
    }
  }
}
