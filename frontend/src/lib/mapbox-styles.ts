// Keep selectable basemaps local and explicit; user preferences must never become arbitrary map URLs.
export const MAPBOX_STYLES = [
  {id: "standard", label: "标准", url: "mapbox://styles/mapbox/standard", standard: true},
  {id: "streets-v12", label: "街道", url: "mapbox://styles/mapbox/streets-v12", standard: false},
  {id: "dark-v11", label: "深色", url: "mapbox://styles/mapbox/dark-v11", standard: false},
] as const

export type MapboxStyleId = typeof MAPBOX_STYLES[number]["id"]
export type MapboxStyle = typeof MAPBOX_STYLES[number]
export const DEFAULT_MAPBOX_STYLE: MapboxStyleId = "standard"

export function getMapboxStyle(id: unknown): MapboxStyle {
  return MAPBOX_STYLES.find(style => style.id === id) || MAPBOX_STYLES[0]
}

export function normalizeMapboxStyle(id: unknown): MapboxStyleId {
  return getMapboxStyle(id).id
}

export function mapboxStyleConfig(id: unknown, dark: boolean) {
  const style = getMapboxStyle(id)
  if (!style.standard) return undefined
  const basemap = {
    lightPreset: dark ? "night" : "day",
    showPointOfInterestLabels: false,
    showTransitLabels: false,
    showRoadLabels: false,
    theme: "monochrome", show3dObjects: false,
  }
  return {basemap}
}
