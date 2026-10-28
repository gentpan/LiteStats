import { z } from "zod"
import { createServerFn } from "@tanstack/react-start"
import { requireAdmin } from "./session"
import {
  createManagedUser,
  deleteManagedUser,
  disabledSchema,
  listManagedUsers,
  registerPublicUser,
  registrationEnabled,
  registrationSchema,
  resetManagedUserPassword,
  setManagedUserDisabled,
  setManagedUserRole,
  setRegistrationEnabled,
  userIdSchema,
  userRoleSchema,
} from "./user-management"
import { writeSession } from "./session"

export const registrationStatusFn = createServerFn({method: "GET"}).handler(async () => ({enabled: await registrationEnabled()}))

export const registerFn = createServerFn({method: "POST"})
  .validator((input: unknown) => registrationSchema.parse(input))
  .handler(async ({data}) => {
    const id = await registerPublicUser(data)
    await writeSession(id)
    return {id}
  })

export const userManagementFn = createServerFn({method: "GET"}).handler(async () => {
  await requireAdmin()
  return {users: await listManagedUsers(), registrationEnabled: await registrationEnabled()}
})

export const createUserFn = createServerFn({method: "POST"})
  .validator((input: unknown) => registrationSchema.parse(input))
  .handler(async ({data}) => {
    await requireAdmin()
    return {id: await createManagedUser(data)}
  })

export const setUserDisabledFn = createServerFn({method: "POST"})
  .validator((input: unknown) => z.object({userId: userIdSchema, disabled: disabledSchema}).parse(input))
  .handler(async ({data}) => {
    const admin = await requireAdmin()
    await setManagedUserDisabled(admin.id, data.userId, data.disabled)
    return {ok: true}
  })

export const setUserRoleFn = createServerFn({method: "POST"})
  .validator((input: unknown) => z.object({userId: userIdSchema, role: userRoleSchema}).parse(input))
  .handler(async ({data}) => {
    const admin = await requireAdmin()
    await setManagedUserRole(admin.id, data.userId, data.role)
    return {ok: true}
  })

export const resetUserPasswordFn = createServerFn({method: "POST"})
  .validator((input: unknown) => z.object({userId: userIdSchema}).parse(input))
  .handler(async ({data}) => {
    await requireAdmin()
    return {password: await resetManagedUserPassword(data.userId)}
  })

export const deleteUserFn = createServerFn({method: "POST"})
  .validator((input: unknown) => z.object({userId: userIdSchema}).parse(input))
  .handler(async ({data}) => {
    const admin = await requireAdmin()
    await deleteManagedUser(admin.id, data.userId)
    return {ok: true}
  })

export const setRegistrationEnabledFn = createServerFn({method: "POST"})
  .validator((input: unknown) => z.object({enabled: disabledSchema}).parse(input))
  .handler(async ({data}) => {
    await requireAdmin()
    await setRegistrationEnabled(data.enabled)
    return {ok: true}
  })
