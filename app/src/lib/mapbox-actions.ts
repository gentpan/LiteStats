import { createServerFn } from "@tanstack/react-start"
import { requireAdmin } from "./session"
import { getMapboxSettings, saveMapboxSettings } from "./mapbox-settings"
import { mapboxSettingsSchema } from "./mapbox-validation"

export const mapboxSettingsFn = createServerFn({method: "GET"}).handler(async () => {
  await requireAdmin()
  return getMapboxSettings()
})
export const saveMapboxSettingsFn = createServerFn({method: "POST"})
  .validator((input: unknown) => {
    const result = mapboxSettingsSchema.safeParse(input)
    if (!result.success) throw new Error(result.error.issues[0]?.message || "地图设置无效")
    return result.data
  })
  .handler(async ({data}) => {
    await requireAdmin()
    return saveMapboxSettings(data)
  })
