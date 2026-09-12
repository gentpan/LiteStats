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

export function AccountPreferences({
  user,
  onSaved,
}: {
  user: { name: string, theme?: string, avatar?: string | null, locale?: string }
  onSaved: () => void
}) {
  const { t } = useT()
  const [name, setName] = useState(user.name)
  const [avatar, setAvatar] = useState(user.avatar || "")
  const [error, setError] = useState("")
  const [avatarError, setAvatarError] = useState("")
  const initial = (user.name || "?").slice(0, 1).toUpperCase()

  useEffect(() => {
    setName(user.name)
    setAvatar(user.avatar || "")
  }, [user.name, user.avatar])

  return (
    <>
      <Tile title={t("profile.avatar")} subtitle={t("profile.avatar_sub")}>
        <SettingsForm
          onSubmit={async (e) => {
            e.preventDefault()
            setAvatarError("")
            try {
              await updateProfileFn({ data: { avatar: avatar || null } })
              onSaved()
            } catch (err) {
              setAvatarError(err instanceof Error ? err.message : "无法保存")
            }
          }}
        >
          <div className="settings-avatar-row">
            {avatar ? <img className="settings-avatar-preview" src={avatar} alt="" /> : <span className="settings-avatar-preview">{initial}</span>}
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-secondary">
                {t("profile.change_avatar")}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (!file) return
                    setAvatarError("")
                    try {
                      const next = await resizeAvatar(file)
                      setAvatar(next)
                      await updateProfileFn({ data: { avatar: next } })
                      onSaved()
                    } catch (err) {
                      setAvatarError(err instanceof Error ? err.message : "无法读取图片")
                    }
                  }}
                />
              </label>
              {avatar ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    setAvatar("")
                    await updateProfileFn({ data: { avatar: null } })
                    onSaved()
                  }}
                >
                  {t("profile.remove_avatar")}
                </button>
              ) : null}
            </div>
          </div>
          {avatarError ? <p className="mt-3 text-sm text-red-500">{avatarError}</p> : null}
        </SettingsForm>
      </Tile>
      <Tile title={t("profile.nickname")} subtitle={t("profile.nickname_sub")}>
        <SettingsForm
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            try {
              await updateProfileFn({ data: { name } })
              onSaved()
            } catch (err) {
              setError(err instanceof Error ? err.message : "无法保存")
            }
          }}
        >
          <Field label={t("profile.nickname_label")}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
          <FormActions>
            <button className="btn btn-primary" type="submit">{t("profile.save_nickname")}</button>
          </FormActions>
        </SettingsForm>
      </Tile>
    </>
  )
}
