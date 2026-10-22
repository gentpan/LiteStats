import { createServerFn } from "@tanstack/react-start"
import { saveUserMapStyle } from "./map-style-settings"
import { mapStyleInputSchema } from "./map-style-validation"
import { requireUser } from "./session"

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
