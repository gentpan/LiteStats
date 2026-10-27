import { createServerFn } from "@tanstack/react-start"
import { requireAdmin, requireUser } from "./session"
import { getMapboxSettings, saveMapboxSettings } from "./mapbox-settings"
import { saveUserMapStyle } from "./map-style-settings"
import { mapboxSettingsSchema, mapStyleInputSchema } from "./mapbox-validation"

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

/** The authenticated session supplies the account; a request cannot name another user. */
export function createUserMapStyleHandlers(deps: {
  user: () => Promise<{id: number}>
  save: typeof saveUserMapStyle
}) {
  return {
    async save(input: unknown) {
      const data = mapStyleInputSchema.parse(input)
      const user = await deps.user()
      return {styleId: await deps.save(user.id, data.styleId)}
    },
  }
}

export const saveMapStyleFn = createServerFn({method: "POST"})
  .validator((input: unknown) => mapStyleInputSchema.parse(input))
  .handler(({data}) => createUserMapStyleHandlers({user: requireUser, save: saveUserMapStyle}).save(data))
