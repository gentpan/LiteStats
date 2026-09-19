export const GOOGLE_STYLES = [
  {id:"auto",label:"跟随系统"}, {id:"standard",label:"谷歌原色"},
  {id:"silver",label:"银灰简洁"}, {id:"dark",label:"午夜深色"},
  {id:"retro",label:"复古暖色"}, {id:"aqua",label:"清新蓝绿"},
] as const
export type GoogleStyle = typeof GOOGLE_STYLES[number]["id"]
export const MAPBOX_STYLES = [
  {id:"auto", label:"跟随深浅色", url:""},
  {id:"standard", label:"标准地图", url:"mapbox://styles/mapbox/standard"},
  {id:"light", label:"浅色简洁", url:"mapbox://styles/mapbox/light-v11"},
  {id:"dark", label:"深色简洁", url:"mapbox://styles/mapbox/dark-v11"},
  {id:"streets", label:"街道地图", url:"mapbox://styles/mapbox/streets-v12"},
  {id:"outdoors", label:"户外地形", url:"mapbox://styles/mapbox/outdoors-v12"},
  {id:"satellite", label:"卫星街道", url:"mapbox://styles/mapbox/satellite-streets-v12"},
  {id:"standard-satellite", label:"标准卫星", url:"mapbox://styles/mapbox/standard-satellite"},
  {id:"custom", label:"自定义 Studio 样式", url:""},
] as const
export type MapboxStyle = typeof MAPBOX_STYLES[number]["id"]
export type MapSettings = {provider:"default"|"google"|"mapbox", apiKey:string, googleStyle:GoogleStyle, mapboxToken:string, mapboxStyle:MapboxStyle, mapboxCustomStyle:string}
export const DEFAULT_MAP_SETTINGS: MapSettings = {provider:"default",apiKey:"",googleStyle:"auto",mapboxToken:"",mapboxStyle:"auto",mapboxCustomStyle:""}
export function mapboxStyleUrl(style: MapboxStyle, custom: string, dark: boolean) {
  if (style === "auto") return dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"
  if (style === "custom") return custom
  return MAPBOX_STYLES.find(item => item.id === style)?.url || "mapbox://styles/mapbox/light-v11"
}
