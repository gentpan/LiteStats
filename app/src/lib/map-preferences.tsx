import { createContext, useContext, type ReactNode } from "react"
import { DEFAULT_MAPBOX_STYLE, normalizeMapboxStyle, type MapboxStyleId } from "./mapbox-styles"

const MapStyleContext = createContext<MapboxStyleId>(DEFAULT_MAPBOX_STYLE)
const FLAGS_STORAGE_KEY = "litestats:map-flags"

export function MapStyleProvider({styleId, children}: {styleId: MapboxStyleId; children: ReactNode}) {
  return <MapStyleContext.Provider value={normalizeMapboxStyle(styleId)}>{children}</MapStyleContext.Provider>
}

export function useMapStyle(): MapboxStyleId {
  return useContext(MapStyleContext)
}

// Geography is loaded after hydration, so restore the preference before any
// flag markers are drawn. Missing, invalid or unavailable storage shows flags.
export function readMapFlags(): boolean {
  try { return localStorage.getItem(FLAGS_STORAGE_KEY) !== "hidden" } catch { return true }
}

export function saveMapFlags(show: boolean): void {
  try { localStorage.setItem(FLAGS_STORAGE_KEY, show ? "visible" : "hidden") } catch { /* Keep the current page usable when storage is blocked. */ }
}
