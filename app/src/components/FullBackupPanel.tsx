import {useEffect,useRef,useState} from "react"
import {ActionButton} from "./ActionButton"
import {Field} from "./SettingsForm"
import {Tile} from "./ui"
import {useT} from "~/lib/i18n"
import {formatTimestamp} from "~/lib/format"
import type {FullBackupList,FullBackupJob,FullBackupSummary} from "~/lib/instance-backup-handler"
const endpoint="/api/instance-backups",storageKey="litestats.full-backup-job"
const phases:Record<string,string>={prepared:"准备完成",validating:"正在校验备份",pausing:"正在暂停应用","backing-up":"正在备份两个数据库","safety-backup":"正在保存恢复前备份",restoring:"正在还原到新数据库",restarting:"正在重启并检查应用",completed:"操作完成",failed:"操作失败",interrupted:"作业中断"}
async function result<T>(response:Response):Promise<T>{
  if(!response.ok){let message="备份服务暂不可用，请稍后重试";try{message=(await response.json()).error||message}catch{}throw new Error(message)}
  return response.json() as Promise<T>
}
async function post<T>(action:string,data:unknown){return result<T>(await fetch(`${endpoint}?action=${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}))}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000)}
export function FullBackupPanel(){
  const {t,locale}=useT()
  const [list,setList]=useState<FullBackupList|null>(null),[error,setError]=useState("")
  const [busy,setBusy]=useState(""),[job,setJob]=useState<FullBackupJob|null>(null)
  const [selected,setSelected]=useState(""),[key,setKey]=useState(""),[verified,setVerified]=useState<FullBackupSummary|null>(null)
  const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("")
  const [keyDialog,setKeyDialog]=useState(false),[keyPassword,setKeyPassword]=useState("")
  const mounted=useRef(true),fileInput=useRef<HTMLInputElement>(null)
  const running=!!busy||job?.state==="running"||job?.state==="prepared"||!!list?.active
  async function load(){setList(await result<FullBackupList>(await fetch(endpoint,{cache:"no-store"})))}
  function summary(value:FullBackupSummary){return t("{0} 个站点 · {1} 个账号 · {2} 条事件",{0:value.sites,1:value.users,2:value.events})}
  function poll(id:string,ticket:string){
    const check=async()=>{
      if(!mounted.current)return
      try{
        const current=await result<FullBackupJob>(await fetch(`${endpoint}?action=status&id=${id}`,{cache:"no-store",headers:{"X-Backup-Ticket":ticket}}))
        if(!mounted.current)return
        setJob(current)
        if(current.state==="prepared"){
          try{await post("activate",{id,ticket})}catch{/* The prepared job expires safely after ten minutes. */}
        }
        if(current.state==="succeeded"||current.state==="failed"){
          sessionStorage.removeItem(storageKey);setBusy("")
          if(current.kind==="verify"&&current.state==="succeeded"&&current.summary)setVerified(current.summary)
          if(current.state==="failed")setError(current.error||t("操作失败，请重试"))
          if(current.kind!=="restore"||current.state==="failed")void load().catch(()=>{})
          else setList(value=>value?{...value,active:null}:null)
          return
        }
      }catch{/* Reconnect after application restart; the per-job ticket survives session changes. */}
      if(mounted.current)setTimeout(()=>void check(),1500)
    };void check()
  }
  useEffect(()=>{
    mounted.current=true;void load().catch(()=>setError(t("完整备份服务暂不可用，请稍后重试")))
    try{const pending=JSON.parse(sessionStorage.getItem(storageKey)||"null") as {id:string;ticket:string}|null;if(pending){setBusy("job");poll(pending.id,pending.ticket)}}catch{sessionStorage.removeItem(storageKey)}
    return()=>{mounted.current=false}
  },[])
  useEffect(()=>{
    if(!list?.active || job?.state==="running" || busy)return
    const timer=setInterval(()=>void load().catch(()=>{}),2000)
    return()=>clearInterval(timer)
  },[list?.active,job?.state,busy])
  async function start(kind:FullBackupJob["kind"]){
    if(running)return;setError("");setBusy(kind)
    try{
      const prepared=await post<FullBackupJob&{ticket:string}>("prepare",{kind,archive:selected,recoveryKey:key,password:kind==="restore"?password:undefined,confirmation})
      setPassword("");setConfirmation("");setJob(prepared)
      sessionStorage.setItem(storageKey,JSON.stringify({id:prepared.id,ticket:prepared.ticket}))
      try{await post("activate",{id:prepared.id,ticket:prepared.ticket})}catch{/* Activation may disconnect while the app restarts. */}
      poll(prepared.id,prepared.ticket)
    }catch(err){setError(err instanceof Error?err.message:t("操作失败，请重试"));setBusy("")}
  }
  async function upload(file:File|undefined){
    if(!file||running)return;setError("");setVerified(null);setBusy("upload")
    try{
      if(!file.name.endsWith(".lsb")||file.size>10*1024**3)throw new Error(t("请选择小于 10 GB 的完整 .lsb 备份文件"))
      const uploaded=await result<{id:string}>(await fetch(`${endpoint}?action=upload`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file}))
      setSelected(uploaded.id);setKey("");await load()
    }catch(err){setError(err instanceof Error?err.message:t("上传失败，请重试"))}
    finally{setBusy("");if(fileInput.current)fileInput.current.value=""}
  }
  return <Tile id="full-backup" icon="shield" title={t("完整备份与恢复")} subtitle={t("统一保存 PostgreSQL、ClickHouse 和运行配置")}>
    <p className="settings-hint">{t("在这里创建、下载或上传完整加密备份。恢复前自动保存当前数据，还原到新数据库并校验，成功后切换；旧数据库保留。")}</p>
    <p className="settings-hint">{t("备份和恢复期间会短暂暂停采集与后台访问，完成后自动恢复。")}</p>
    <div className="backup-run-actions">
      <ActionButton icon="cloud" className="btn btn-primary" loading={busy==="backup"} disabled={running||!list} onClick={()=>void start("backup")}>{t("创建完整备份")}</ActionButton>
      <ActionButton icon="upload" loading={busy==="upload"} disabled={running||!list} onClick={()=>fileInput.current?.click()}>{t("上传备份文件")}</ActionButton>
      <ActionButton icon="key" disabled={running||!list} onClick={()=>{setKeyDialog(!keyDialog);setKeyPassword("")}}>{t("下载恢复密钥")}</ActionButton>
      <input ref={fileInput} type="file" accept=".lsb" className="sr-only" aria-label={t("上传备份文件")} onChange={e=>void upload(e.target.files?.[0])}/>
    </div>
    {keyDialog?<form className="squircle full-backup-confirm" onSubmit={async e=>{
      e.preventDefault();if(running)return;setBusy("key");setError("")
      try{const response=await fetch(`${endpoint}?action=key`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:keyPassword})});if(!response.ok)await result(response);download(await response.blob(),"plost-recovery.key");setKeyPassword("");setKeyDialog(false)}catch(err){setError(err instanceof Error?err.message:t("操作失败，请重试"))}finally{setBusy("")}
    }}><p className="settings-hint">{t("恢复密钥请与备份文件分开保存，丢失后无法解密备份。")}</p>
      <Field label={t("当前管理员密码")}><input className="squircle input" required type="password" maxLength={256} autoComplete="current-password" value={keyPassword} onChange={e=>setKeyPassword(e.target.value)}/></Field>
      <ActionButton type="submit" icon="download" loading={busy==="key"} disabled={running}>{t("确认下载密钥")}</ActionButton></form>:null}
    {job?<div role="status" aria-live="polite" className={`squircle settings-feedback ${job.state==="failed"?"is-error":""}`}>
      <strong>{t(phases[job.phase]||"正在处理备份任务")}</strong>{job.summary?<p>{summary(job.summary)}</p>:null}
      {job.state==="running"||job.state==="prepared"?<p>{t("任务在服务器继续执行，页面会自动重新连接。")}</p>:null}
      {job.state==="succeeded"&&job.kind==="restore"?<a href="/login" className="full-backup-login">{t("恢复完成，重新登录")}</a>:null}</div>:null}
    {error?<p role="alert" className="squircle settings-feedback is-error">{t(error)}</p>:null}
    {list?.items.length?<ul className="backup-result-list full-backup-list">{list.items.map(item=><li key={item.id} className="backup-result-row">
      <div className="min-w-0"><strong>{formatTimestamp(item.summary?.createdAt||item.createdAt,locale)}</strong><p>{(item.bytes/1024/1024).toFixed(1)} MB{item.summary?` · ${summary(item.summary)}`:""}</p><p className="full-backup-filename">{item.id}</p></div>
      <div className="backup-run-actions"><a className={`squircle ui-action ${running?"is-disabled":""}`} aria-disabled={running} tabIndex={running?-1:0} href={running?undefined:`${endpoint}?action=archive&id=${encodeURIComponent(item.id)}`}>{t("下载")}</a><ActionButton icon="refresh" disabled={running} onClick={()=>{setSelected(item.id);setVerified(null);setKey("");setPassword("");setConfirmation("")}}>{t("校验与恢复")}</ActionButton></div>
    </li>)}</ul>:<div className="backup-empty"><p>{t(list?"尚无完整备份，点击创建即可保存当前实例。":"正在连接完整备份服务")}</p></div>}
    {selected?<form className="squircle full-backup-confirm" onSubmit={e=>{e.preventDefault();void start(verified?"restore":"verify")}}>
      <h3>{t("校验与恢复")}</h3><p className="full-backup-filename">{selected}</p>
      <Field label={t("原备份的恢复密钥")} hint={t("本机备份可留空；其他实例的备份请上传原恢复密钥文件。") }><input className="squircle input" type="file" accept=".key,.txt" disabled={running} onChange={async e=>{const file=e.target.files?.[0];setVerified(null);if(!file){setKey("");return}if(file.size>512){setError(t("无效的恢复密钥"));return}setKey((await file.text()).trim())}}/></Field>
      {verified?<><p className="settings-hint">{t("校验通过：{0}",{0:summary(verified)})}</p><p className="settings-hint">{t("仅恢复你信任的 Plost 实例备份。恢复后账号和密码以备份为准，需要重新登录。")}</p>
        <Field label={t("当前管理员密码")}><input className="squircle input" type="password" required maxLength={256} autoComplete="current-password" disabled={running} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
        <Field label={t("输入 RESTORE 确认恢复")}><input className="squircle input" required pattern="RESTORE" autoComplete="off" spellCheck={false} disabled={running} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field></>:null}
      <div className="backup-run-actions"><ActionButton type="submit" icon={verified?"refresh":"shield"} className={verified?"btn btn-danger":""} loading={busy==="verify"||busy==="restore"} disabled={running}>{t(verified?"恢复此完整备份":"校验备份文件")}</ActionButton><ActionButton disabled={running} onClick={()=>{setSelected("");setKey("");setVerified(null)}}>{t("取消")}</ActionButton></div>
    </form>:null}
  </Tile>
}
