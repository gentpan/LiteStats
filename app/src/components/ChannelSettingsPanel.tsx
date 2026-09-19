import { UIIcon } from "./UIIcon"
import { ActionButton } from "~/components/ActionButton"
import { useState } from "react"
import { Tile } from "./ui"
import { Field, FormActions, SettingsForm } from "./SettingsForm"
import { clearChannelFn, saveChannelFn, systemSettingsFn, verifyChannelFn } from "~/lib/actions"
import { useT } from "~/lib/i18n"

type Settings = Awaited<ReturnType<typeof systemSettingsFn>>
export function ChannelSettingsPanel({channel,initial}:{channel:"smtp"|"telegram",initial:Settings}) {
  const {t}=useT()
  const [saved,setSaved]=useState(initial)
  const [smtp,setSmtp]=useState(initial.smtp)
  const [telegram,setTelegram]=useState(initial.telegram)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState("")
  const [error,setError]=useState("")
  const current=channel === "smtp" ? smtp : telegram
  const dirty=JSON.stringify(current)!==JSON.stringify(saved[channel])
  function accept(next:Settings) {setSaved(next);setSmtp(next.smtp);setTelegram(next.telegram)}
  async function check() {
    setBusy(true);setError("");setMessage("")
    try {accept(await verifyChannelFn({data:{channel}}));setMessage(t("连接检查通过，未发送任何消息。"))}
    catch(err){setError(err instanceof Error ? err.message : t("连接检查失败"))}
    finally {setBusy(false)}
  }
  return <div className="channel-settings-panel"><Tile icon={channel === "telegram" ? "telegram" : "mail"} title={channel === "smtp" ? t("邮件服务 SMTP") : t("Telegram 机器人")} subtitle={t("系统级通道配置，仅实例管理员可修改。") }>
    <p className="settings-notice">{t("此处配置通知通道。自动告警和定时邮件报告尚未接入，保存不会自动发送消息。")}</p>
    {channel === "telegram" ? <details className="channel-setup-guide"><summary>{t("如何获取机器人配置？")}</summary><p>{t("先通过 @BotFather 创建机器人并取得 Token，再填写接收会话的 Chat ID。私聊先向机器人发送 /start；群组需先加入机器人。")}</p></details> : null}
    <SettingsForm onSubmit={async event=>{
      event.preventDefault();setMessage("");setError("")
      const next=await saveChannelFn({data:channel === "smtp" ? {channel,settings:smtp} : {channel,settings:telegram}})
      accept(next);setMessage(t("通道配置已保存"))
    }}>
      <fieldset className="contents" disabled={busy}>
      {channel === "smtp" ? <>
        <div className="settings-field-grid">
        <Field wide label={t("SMTP 服务器")}><input className="input" placeholder="smtp.example.com" required value={smtp.host} onChange={e=>setSmtp({...smtp,host:e.target.value})} /></Field>
        <Field label={t("加密方式")}><select className="input" value={smtp.security} onChange={e=>setSmtp({...smtp,security:e.target.value as "tls"|"starttls",port:e.target.value === "tls" ? 465 : 587})}><option value="starttls">STARTTLS</option><option value="tls">TLS / SSL</option></select></Field>
        <Field label={t("端口")}><input className="input" type="number" min={1} max={65535} required value={smtp.port} onChange={e=>setSmtp({...smtp,port:Number(e.target.value)})} /></Field>
        <Field label={t("SMTP 用户名")}><input className="input" autoComplete="off" value={smtp.username} onChange={e=>setSmtp({...smtp,username:e.target.value})} /></Field>
        <Field label={t("SMTP 密码或授权码")} hint={smtp.hasPassword ? t("已保存，留空保留现有凭据。") : t("填写邮件服务商提供的密码或应用授权码。")}><input className="input" type="password" autoComplete="new-password" value={smtp.password} onChange={e=>setSmtp({...smtp,password:e.target.value})} /></Field>
        <Field label={t("发件人邮箱")}><input className="input" type="email" required value={smtp.fromEmail} onChange={e=>setSmtp({...smtp,fromEmail:e.target.value})} /></Field>
        <Field label={t("发件人名称")}><input className="input" value={smtp.fromName} onChange={e=>setSmtp({...smtp,fromName:e.target.value})} /></Field>
        </div>
        <p className="mt-4 text-xs leading-6 text-gray-500">{t("通常使用 587 + STARTTLS 或 465 + TLS；以邮件服务商说明为准。连接检查验证连接和认证，不验证最终投递。")}</p>
      </> : <>
        <Field label="Bot Token" hint={telegram.hasToken ? t("已保存，留空保留现有凭据。") : undefined}><input className="input" type="password" autoComplete="new-password" placeholder="123456:ABC…" required={!telegram.hasToken} value={telegram.token} onChange={e=>setTelegram({...telegram,token:e.target.value})} /></Field>
        <Field label="Chat ID" hint={t("可填写数字会话 ID（群组通常为负数），或公开频道的 @username。")}><input className="input" placeholder="-1001234567890" required value={telegram.chatId} onChange={e=>setTelegram({...telegram,chatId:e.target.value})} /></Field>
      </>}
      <FormActions>
        <ActionButton className="btn btn-primary" type="submit" disabled={busy}>{t("保存设置")}</ActionButton>
        <ActionButton icon="plug" className="btn btn-secondary" type="button" disabled={busy || dirty || !saved[channel].configured} onClick={check}>{busy ? t("检查中…") : t("检查连接")}</ActionButton>
        {saved[channel].configured ? <ActionButton icon="trash" className="btn btn-ghost" type="button" disabled={busy} onClick={async()=>{
          if(!window.confirm(t("清除这个通道的配置和凭据？")))return
          setBusy(true);setError("")
          try {accept(await clearChannelFn({data:{channel}}));setMessage(t("通道配置已清除"))} catch(err){setError(err instanceof Error ? err.message : t("保存失败"))} finally {setBusy(false)}
        }}>{t("清除配置")}</ActionButton> : null}
      </FormActions>
      </fieldset>
    </SettingsForm>
    <div className="settings-meta">
    <p className="settings-status">{dirty ? t("请先保存修改，再检查连接。") : saved[channel].verifiedAt ? t("已通过连接检查") : saved[channel].configured ? t("已配置，尚未检查连接") : t("尚未配置")}</p>
    <a className="settings-doc-link" href={channel === "smtp" ? "https://nodemailer.com/smtp" : "https://core.telegram.org/bots/tutorial"} target="_blank" rel="noreferrer">{t("查看配置说明")}<UIIcon name="external" /></a>
    </div>
    {message ? <p role="status" className="mt-3 text-sm text-indigo-600">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{t(error)}</p> : null}

  </Tile></div>
}
