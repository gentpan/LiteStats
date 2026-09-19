import { UserAvatar } from "./UserAvatar"
import { UIIcon } from "~/components/UIIcon"
import { ActionButton } from "~/components/ActionButton"
import { useEffect, useState } from "react"
import { Field, FormActions, SettingsForm } from "~/components/SettingsForm"
import { Tile } from "~/components/ui"
import { updateProfileFn } from "~/lib/actions"
import { useT } from "~/lib/i18n"

function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片"))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement("canvas")
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("无法处理图片"))
        return
      }
      const min = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, 256, 256)
      const data = canvas.toDataURL("image/jpeg", 0.86)
      resolve(data.length > 200_000 ? canvas.toDataURL("image/jpeg", 0.7) : data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("无法读取图片"))
    }
    img.src = url
  })
}

export function AccountPreferences({ user, onSaved }: {
  user: { name: string, avatar?: string | null, gravatarUrl?: string }
  onSaved: () => void
}) {
  const { t, locale, setLocale } = useT()
  const [language,setLanguage] = useState(locale)
  useEffect(()=>setLanguage(locale),[locale])
  const [name, setName] = useState(user.name)
  const [avatar, setAvatar] = useState(user.avatar || "")
  const [avatarError, setAvatarError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {setName(user.name);setAvatar(user.avatar || "")}, [user.name,user.avatar])
  return <Tile icon="user" title={t("偏好设置")}>
    <SettingsForm className="preferences-form" onSubmit={async event=>{event.preventDefault();setSaved(false);await updateProfileFn({data:{name,avatar:avatar || null,locale:language}});setLocale(language);onSaved();setSaved(true)}}>
      <div className="settings-avatar-row">
        <UserAvatar avatar={avatar} gravatarUrl={user.gravatarUrl} name={name} className="settings-avatar-preview" alt={t("profile.avatar")} />
        <div className="flex flex-wrap gap-2">
          <label className="btn btn-secondary"><UIIcon name="user" />{t("profile.change_avatar")}<input type="file" accept="image/*" className="sr-only" disabled={processing} onChange={async event=>{
            const file=event.target.files?.[0];event.target.value="";if(!file)return
            setProcessing(true);setAvatarError("");setSaved(false)
            try {setAvatar(await resizeAvatar(file))} catch(err){setAvatarError(err instanceof Error ? err.message : t("无法读取图片"))} finally {setProcessing(false)}
          }} /></label>
          {avatar ? <ActionButton icon="trash" type="button" className="btn btn-secondary" onClick={()=>{setAvatar("");setSaved(false)}}>{t("profile.remove_avatar")}</ActionButton> : null}
        </div>
      </div>
      {avatarError ? <p role="alert" className="mt-3 text-sm text-red-600">{t(avatarError)}</p> : null}
      <Field label={t("profile.nickname_label")}><input className="input" required value={name} onChange={event=>{setName(event.target.value);setSaved(false)}} /></Field>
      <Field label={t("界面语言")}><select className="input" value={language} onChange={event=>{setLanguage(event.target.value === "en" ? "en" : "zh-CN");setSaved(false)}}><option value="zh-CN">简体中文</option><option value="en">English</option></select></Field>
      <FormActions><ActionButton className="btn btn-primary" type="submit" disabled={processing}>{t("保存设置")}</ActionButton>{saved ? <span role="status" className="text-sm text-indigo-600">{t("设置已保存")}</span> : null}</FormActions>
    </SettingsForm>
  </Tile>
}
