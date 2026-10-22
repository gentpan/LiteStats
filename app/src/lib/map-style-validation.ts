import { z } from "zod"
import { MAPBOX_STYLES, type MapboxStyleId } from "./mapbox-styles"

/** Safe in browser-side server-function validators: no database or server environment imports. */
export const mapboxStyleIdSchema = z.custom<MapboxStyleId>(
  value => MAPBOX_STYLES.some(style => style.id === value),
  { message: "请选择有效的地图样式" },
)

export const mapStyleInputSchema = z.object({styleId: mapboxStyleIdSchema}).strict()
