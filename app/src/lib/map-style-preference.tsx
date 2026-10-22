import { createContext, useContext, type ReactNode } from "react"
import { DEFAULT_MAPBOX_STYLE, normalizeMapboxStyle, type MapboxStyleId } from "./mapbox-styles"

const MapStyleContext = createContext<MapboxStyleId>(DEFAULT_MAPBOX_STYLE)

export function MapStyleProvider({styleId, children}: {styleId: MapboxStyleId; children: ReactNode}) {
  return <MapStyleContext.Provider value={normalizeMapboxStyle(styleId)}>{children}</MapStyleContext.Provider>
}

export function useMapStyle(): MapboxStyleId {
  return useContext(MapStyleContext)
}
