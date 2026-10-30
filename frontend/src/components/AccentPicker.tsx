import { useId, useState, useSyncExternalStore } from "react"
import { ACCENT_CHOICES, readAccentColor, setAccentColor, subscribeAccentColor } from "~/lib/accent-preference"
import { useT } from "~/lib/i18n"

export function AccentPicker() {
  const { t } = useT()
  const hintId = useId()
  const accent = useSyncExternalStore(subscribeAccentColor, readAccentColor, () => "purple")
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  return <fieldset className="accent-picker" aria-describedby={storageUnavailable ? hintId : undefined}>
    <legend className="accent-picker-label" title={t("立即生效，保存在当前浏览器。")}>{t("界面配色")}</legend>
    <div className="accent-options">
      {ACCENT_CHOICES.map(choice => <label key={choice.value} className={`squircle accent-option${accent === choice.value ? " is-selected" : ""}`} data-accent-option={choice.value}>
        <input type="radio" className="sr-only" name="interface-accent" value={choice.value} checked={accent === choice.value} onChange={() => setStorageUnavailable(!setAccentColor(choice.value))} />
        <span className="accent-swatch" aria-hidden="true" />
        <span>{t(choice.label)}</span>
      </label>)}
    </div>
    {storageUnavailable ? <p className="settings-hint" id={hintId} role="status">{t("已应用，当前浏览器无法保存此配色。")}</p> : null}
  </fieldset>
}
