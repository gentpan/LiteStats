import type { Map as MapboxMap } from "mapbox-gl"
import { getMapboxStyle, mapboxStyleConfig, type MapboxStyle, type MapboxStyleId } from "./mapbox-styles"

type StyleMap = Pick<MapboxMap, "on" | "off" | "setStyle">
type MapError = {status?: number; message?: string; url?: string}

function authorizationErrorForStyle(error: MapError | undefined, style: MapboxStyle) {
  if (!error) return false
  const authorization = error.status === 401 || error.status === 403 || /valid Mapbox access token is required/i.test(error.message || "")
  if (!authorization) return false
  // An aborted basemap request can still fail after another style has been selected.
  // Tile/session errors are shared by all styles and still need the normal fallback.
  const resource = error.url || error.message || ""
  const requestedStyle = resource.match(/(?:\/styles\/v1\/mapbox\/|mapbox:\/\/styles\/mapbox\/)([\w-]+)/)?.[1]
  return !requestedStyle || requestedStyle === style.id
}

export function createMapboxStyleLifecycle(map: StyleMap, options: {
  initialStyleId: MapboxStyleId
  isDark: () => boolean
  onLoading: () => void
  onReady: (style: MapboxStyle) => void
  onFailure: () => void
  timeoutMs?: number
}) {
  let current = getMapboxStyle(options.initialStyleId)
  let disposed = false, failed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const fail = () => {
    if (disposed || failed) return
    failed = true
    clearTimeout(timer)
    options.onFailure()
  }
  const armTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(fail, options.timeoutMs ?? 20_000)
  }
  const loaded = () => {
    if (disposed || failed) return
    clearTimeout(timer)
    try { options.onReady(current) } catch { fail() }
  }
  const error = (event: {error: MapError}) => {
    if (authorizationErrorForStyle(event.error, current)) fail()
  }
  // Register once for the map lifetime. setStyle cancels the previous style's requests,
  // and style.load restores application layers for whichever basemap is current.
  map.on("style.load", loaded)
  map.on("error", error)
  map.on("webglcontextlost", fail)
  armTimeout()
  return {
    setStyle(id: MapboxStyleId) {
      const next = getMapboxStyle(id)
      if (disposed || failed || current.id === next.id) return
      current = next
      options.onLoading()
      armTimeout()
      try {
        // A full style replacement also cancels stale imports. The map and camera stay alive.
        map.setStyle(next.url, {
          diff: false, config: mapboxStyleConfig(next.id, options.isDark()),
          localFontFamily: undefined, localIdeographFontFamily: undefined,
        })
      } catch { fail() }
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      map.off("style.load", loaded)
      map.off("error", error)
      map.off("webglcontextlost", fail)
    },
  }
}
