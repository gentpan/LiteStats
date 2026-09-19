import { db } from "./db"
import { DEFAULT_MAP_SETTINGS, type MapSettings } from "./map-options"
export async function getMapSettings(siteId: number): Promise<MapSettings> {
  const result = await (await db()).query<{provider: MapSettings["provider"], api_key: string, google_style:MapSettings["googleStyle"], mapbox_token:string, mapbox_style:MapSettings["mapboxStyle"], mapbox_custom_style:string}>("SELECT provider, api_key, google_style, mapbox_token, mapbox_style, mapbox_custom_style FROM site_map_settings WHERE site_id=$1", [siteId])
  const row = result.rows[0]
  return row ? {provider:row.provider,apiKey:row.api_key,googleStyle:row.google_style || "auto",mapboxToken:row.mapbox_token,mapboxStyle:row.mapbox_style,mapboxCustomStyle:row.mapbox_custom_style} : {...DEFAULT_MAP_SETTINGS}
}
export async function saveMapSettings(siteId: number, settings: MapSettings) {
  await (await db()).query("INSERT INTO site_map_settings (site_id, provider, api_key, mapbox_token, mapbox_style, mapbox_custom_style, google_style) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (site_id) DO UPDATE SET provider=EXCLUDED.provider, api_key=EXCLUDED.api_key, mapbox_token=EXCLUDED.mapbox_token, mapbox_style=EXCLUDED.mapbox_style, mapbox_custom_style=EXCLUDED.mapbox_custom_style, google_style=EXCLUDED.google_style", [siteId,settings.provider,settings.apiKey,settings.mapboxToken,settings.mapboxStyle,settings.mapboxCustomStyle,settings.googleStyle])
}
