import { mapboxMapDocument } from "~/lib/mapbox-map-document"
import type { MapSettings } from "~/lib/map-options"
import { useEffect, useRef, useState } from "react"
import { googleMapDocument, type MapPoint } from "~/lib/google-map-document"
import { useT } from "~/lib/i18n"

export function ExternalVisitorMap({settings, provider, points, onCountryClick, onFailure}: {settings: MapSettings, provider: "google" | "mapbox", points: MapPoint[], onCountryClick?: (code: string) => void, onFailure: () => void}) {
  const {locale, t} = useT()
  const frame = useRef<HTMLIFrameElement>(null)
  const [documentText, setDocumentText] = useState("")
  const [ready, setReady] = useState(false)
  const callbacks = useRef({onCountryClick, onFailure})
  callbacks.current = {onCountryClick, onFailure}
  useEffect(() => {
    const update = () => {
      setReady(false)
      const common = {points, locale, dark: document.documentElement.dataset.theme === "dark", origin: window.location.origin}
      setDocumentText(provider === "google" ? googleMapDocument({...common, apiKey:settings.apiKey, style:settings.googleStyle}) : mapboxMapDocument({...common, token:settings.mapboxToken, style:settings.mapboxStyle, customStyle:settings.mapboxCustomStyle}))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]})
    return () => observer.disconnect()
  }, [provider, settings.googleStyle, settings.apiKey, settings.mapboxToken, settings.mapboxStyle, settings.mapboxCustomStyle, points, locale])
  useEffect(() => {
    if (!documentText) return
    const timer = window.setTimeout(() => callbacks.current.onFailure(), 20000)
    function message(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== `litestats-${provider}-map`) return
      if (event.data.type === "ready") { setReady(true); window.clearTimeout(timer) }
      if (event.data.type === "error") { window.clearTimeout(timer); callbacks.current.onFailure() }
      if (event.data.type === "country" && points.some(point => point.code === event.data.code)) callbacks.current.onCountryClick?.(event.data.code)
    }
    window.addEventListener("message", message)
    return () => { window.clearTimeout(timer); window.removeEventListener("message", message) }
  }, [documentText, points, provider])
  return <div className="google-visitor-map">
    {!ready ? <div className="google-map-loading" role="status">{t(provider === "google" ? "正在加载 Google 地图…" : "正在加载 Mapbox 地图…")}</div> : null}
    <iframe ref={frame} title={t(provider === "google" ? "Google 访客分布地图" : "Mapbox 访客分布地图")} srcDoc={documentText || undefined} allow="fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
  </div>
}
