import { z } from "zod"
import { MAPBOX_STYLES, type MapboxStyleId } from "./mapbox-styles"

// GL JS runs in the browser: accept public tokens only, never secret tokens.
export const mapboxTokenSchema = z.string().trim().max(2048).regex(/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "请填写以 pk. 开头的 Mapbox 公开 Token")
export const mapboxSettingsSchema = z.object({
  enabled: z.boolean(),
  token: z.union([z.literal(""), mapboxTokenSchema]).optional(),
})

/** Safe in browser-side server-function validators: no database or server environment imports. */
export const mapboxStyleIdSchema = z.custom<MapboxStyleId>(
  value => MAPBOX_STYLES.some(style => style.id === value),
  { message: "请选择有效的地图样式" },
)

export const mapStyleInputSchema = z.object({styleId: mapboxStyleIdSchema}).strict()
