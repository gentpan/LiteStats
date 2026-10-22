import { z } from "zod"

// GL JS runs in the browser: accept public tokens only, never secret tokens.
export const mapboxTokenSchema = z.string().trim().max(2048).regex(/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "请填写以 pk. 开头的 Mapbox 公开 Token")
export const mapboxSettingsSchema = z.object({
  enabled: z.boolean(),
  token: z.union([z.literal(""), mapboxTokenSchema]).optional(),
})
