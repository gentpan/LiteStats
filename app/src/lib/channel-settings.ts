import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { lookup } from "node:dns/promises"
import nodemailer from "nodemailer"
import { db } from "./db"
import { SESSION_KEY } from "./env"
import { isPublicAddress } from "./safe-http"
import { channelInput, type SmtpSettings, type TelegramSettings } from "./channel-schema"

export type Channel = "smtp" | "telegram"
type Stored = { smtp?: SmtpSettings, telegram?: TelegramSettings }
const encryptionKey = () => createHash("sha256").update(`litestats-channels:${SESSION_KEY}`).digest()
function encrypt(value: unknown) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv)
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()])
  return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString("base64")).join(":")
}
function decrypt(value:string) {
  const [iv,tag,data]=value.split(":").map(part=>Buffer.from(part,"base64"))
  const cipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString("utf8"))
}
async function table() { return db() }
async function read(channel:Channel) {
  const row=await (await table()).query<{encrypted:string,verified_at:Date|null}>(`SELECT encrypted, verified_at FROM litestats_channels WHERE channel=$1`,[channel])
  return row.rows[0] || null
}
export async function getChannelSettings() {
  const [smtpRow,tgRow]=await Promise.all([read("smtp"),read("telegram")])
  const smtp:SmtpSettings=smtpRow ? decrypt(smtpRow.encrypted) : {host:"",port:587,security:"starttls",username:"",password:"",fromEmail:"",fromName:"LiteStats"}
  const telegram:TelegramSettings=tgRow ? decrypt(tgRow.encrypted) : {token:"",chatId:""}
  return {
    smtp:{...smtp,password:"",hasPassword:!!smtp.password,configured:!!smtpRow,verifiedAt:smtpRow?.verified_at?.toISOString() || null},
    telegram:{...telegram,token:"",hasToken:!!telegram.token,configured:!!tgRow,verifiedAt:tgRow?.verified_at?.toISOString() || null},
  }
}
export async function saveChannelSettings(input:unknown) {
  const data=channelInput.parse(input)
  const pool=await table()
  // Serialize blank-secret merges so independent saves cannot discard credentials.
  const client=await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`litestats-channel-${data.channel}`])
    const row=await client.query<{encrypted:string}>("SELECT encrypted FROM litestats_channels WHERE channel=$1",[data.channel])
    const previous=row.rows[0] ? decrypt(row.rows[0].encrypted) : {}
    const settings={...data.settings}
    if (data.channel === "smtp") {
      const smtp=settings as SmtpSettings
      if (!smtp.password) smtp.password=previous.password || ""
      if (smtp.username && !smtp.password) throw new Error("请填写 SMTP 密码或授权码")
    } else {
      const tg=settings as TelegramSettings
      if (!tg.token) tg.token=previous.token || ""
      if (!tg.token) throw new Error("请填写 Telegram Bot Token")
    }
    await client.query(`INSERT INTO litestats_channels(channel,encrypted) VALUES($1,$2) ON CONFLICT(channel) DO UPDATE SET encrypted=EXCLUDED.encrypted,verified_at=NULL`,[data.channel,encrypt(settings)])
    await client.query("COMMIT")
  } catch(error) {await client.query("ROLLBACK");throw error} finally {client.release()}
  return getChannelSettings()
}
export async function clearChannelSettings(channel:Channel) {
  await (await table()).query("DELETE FROM litestats_channels WHERE channel=$1",[channel])
  return getChannelSettings()
}

export async function verifyChannelSettings(channel:Channel) {
  const row=await read(channel)
  if (!row) throw new Error("请先保存通道配置")
  if (channel === "smtp") {
    const settings:NonNullable<Stored["smtp"]>=decrypt(row.encrypted)
    const addresses=await lookup(settings.host,{all:true}).catch(()=>[])
    if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) throw new Error("SMTP 服务器必须能解析为公网地址")
    const transport=nodemailer.createTransport({
      host:addresses[0].address,port:settings.port,secure:settings.security === "tls",requireTLS:settings.security === "starttls",
      tls:{servername:settings.host,rejectUnauthorized:true},
      auth:settings.username ? {user:settings.username,pass:settings.password} : undefined,
      connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    })
    try {await transport.verify()} catch {throw new Error("SMTP 连接检查失败，请核对服务器、端口、加密方式及账号凭据")} finally {transport.close()}
  } else {
    const settings:NonNullable<Stored["telegram"]>=decrypt(row.encrypted)
    // Read-only checks. No messages are sent by this endpoint.
    for (const method of ["getMe","getChat"]) {
      try {
        const response=await fetch(`https://api.telegram.org/bot${settings.token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(method === "getChat" ? {chat_id:settings.chatId} : {}),signal:AbortSignal.timeout(12000)})
        const result=await response.json() as {ok?:boolean}
        if (!response.ok || !result.ok) throw new Error("Invalid response")
      } catch {throw new Error("Telegram 检查失败，请核对 Bot Token、Chat ID 及机器人访问权限")}
    }
  }
  await (await table()).query("UPDATE litestats_channels SET verified_at=now() WHERE channel=$1 AND encrypted=$2",[channel,row.encrypted])
  return getChannelSettings()
}
