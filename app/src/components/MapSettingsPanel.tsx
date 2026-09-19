import { UIIcon, BrandIcon } from "./UIIcon"
import { ActionButton } from "~/components/ActionButton"
import { SettingsForm, FormActions, Field } from "./SettingsForm"
import { useEffect, useState } from "react"
import { useT } from "~/lib/i18n"
import { saveMapSettingsFn } from "~/lib/actions"
import { GOOGLE_STYLES, type GoogleStyle, MAPBOX_STYLES, type MapboxStyle, type MapSettings } from "~/lib/map-options"
import { Tile } from "./ui"

export function MapSettingsPanel({domain, initial, onSaved}: {domain: string, initial: MapSettings, onSaved: () => Promise<unknown>}) {
  const {t} = useT()
  const [form, setForm] = useState(initial)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  useEffect(() => { setForm(initial) }, [initial])
  return <Tile icon="map" title={t("地图显示")} subtitle={t("默认地图无需凭据；Google 和 Mapbox 使用你自己的账号与配额。") }>
    <SettingsForm className="settings-form gap-5" onSubmit={async event => {
      event.preventDefault(); setPending(true); setMessage(""); setFailed(false)
      try { await saveMapSettingsFn({data: {domain, ...form}}); await onSaved(); setMessage("地图设置已保存") }
      catch { setFailed(true); setMessage("地图设置保存失败，请检查 Key 后重试") }
      finally { setPending(false) }
    }}>
      <fieldset className="settings-provider-options"><legend className="mb-2 text-sm font-medium">{t("地图服务")}</legend>
        {(["default", "google", "mapbox"] as const).map(provider => <label className="settings-provider-option" key={provider}><input type="radio" name="map-provider" checked={form.provider === provider} onChange={() => setForm({...form, provider})} />{provider === "default" ? <UIIcon name="map" /> : <BrandIcon name={provider === "google" ? "google-maps" : "mapbox"} />}{provider === "default" ? t("默认地图") : provider === "google" ? "Google Maps" : "Mapbox"}</label>)}
      </fieldset>
      {form.provider === "default" ? <p className="text-sm text-gray-500">{t("默认地图不加载第三方地图服务。已保存的凭据会保留，方便以后切换。")}</p> : null}
      {form.provider === "google" ? <>
        <Field label="Google Maps API Key">
          <input className="input" type="password" autoComplete="off" value={form.apiKey} required maxLength={200} pattern="[A-Za-z0-9_-]*" placeholder={t("填写你自己的浏览器端 Key")} onChange={event => setForm({...form, apiKey:event.target.value.trim()})} />
        </Field>
        <p className="text-sm leading-6 text-gray-500">{t("在 Google Cloud 开启 Maps JavaScript API 和计费；将 Key 的网站限制设为统计后台域名，并限制只能调用 Maps JavaScript API。")}</p>
        <Field label={t("地图主题")}><select className="input" value={form.googleStyle} onChange={event=>setForm({...form,googleStyle:event.target.value as GoogleStyle})}>{GOOGLE_STYLES.map(style=><option key={style.id} value={style.id}>{t(style.label)}</option>)}</select></Field>
        <a className="text-sm text-indigo-600 underline" href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noreferrer">{t("查看 Google 配置说明")}<UIIcon name="external" /></a>
      </> : null}
      {form.provider === "mapbox" ? <>
        <Field label="Mapbox Public Access Token">
          <input className="input" type="password" autoComplete="off" value={form.mapboxToken} required maxLength={2048} pattern="pk\.[A-Za-z0-9._-]+" placeholder="pk.…" onChange={event => setForm({...form,mapboxToken:event.target.value.trim()})} />
        </Field>
        <p className="text-sm leading-6 text-gray-500">{t("填写 pk. 开头的公开 Token，不要使用 sk. 私密 Token。请在 Mapbox 账户中限制统计后台网址，并确认样式读取权限与配额。")}</p>
        <Field label={t("默认地图主题")}>
          <select className="input" value={form.mapboxStyle} onChange={event => setForm({...form,mapboxStyle:event.target.value as MapboxStyle})}>{MAPBOX_STYLES.map(style => <option key={style.id} value={style.id}>{t(style.label)}</option>)}</select>
        </Field>
        {form.mapboxStyle === "custom" ? <Field label="Mapbox Studio Style URL">
          <input className="input" required placeholder="mapbox://styles/username/style-id" value={form.mapboxCustomStyle} onChange={event => setForm({...form,mapboxCustomStyle:event.target.value.trim()})} />
        </Field> : null}
        <a className="text-sm text-indigo-600 underline" href="https://docs.mapbox.com/help/getting-started/access-tokens/" target="_blank" rel="noreferrer">{t("查看 Mapbox 配置说明")}<UIIcon name="external" /></a>
      </> : null}
      <div className="text-sm leading-6 text-gray-500">
        <p>{t("凭据用于浏览器加载地图，用量由相应账号结算；只在选择该服务时加载。")}</p>
        <p>{t("地图配置仅用于登录后的管理页面，公开页面与分享链接继续使用默认地图。")}</p>
      </div>

      {message ? <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-red-600" : "text-sm text-gray-600"}>{t(message)}</p> : null}
      <FormActions>
      <ActionButton type="submit" disabled={pending} className="btn btn-primary">{t(pending ? "保存中…" : "保存地图设置")}</ActionButton>
      {form.apiKey || form.mapboxToken ? <ActionButton title={t("清空所有地图凭据（保存后生效）")} icon="trash" className="btn btn-secondary" type="button" onClick={() => {setForm({...form,provider:"default",apiKey:"",mapboxToken:""});setMessage("")}}>{t("清空地图凭据")}</ActionButton> : null}
      </FormActions>
    </SettingsForm>
  </Tile>
}
