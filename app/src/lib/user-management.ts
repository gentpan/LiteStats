import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db, type User } from "./db"
import { instanceSetupSchema } from "./instance-setup"

export const registrationSchema = instanceSetupSchema
export const userIdSchema = z.coerce.number().int().positive()
export const userRoleSchema = z.enum(["standard", "admin"])
export const disabledSchema = z.boolean()

export type ManagedUser = User & {disabled: boolean; inserted_at: string}

async function createStandardUser(data: z.infer<typeof registrationSchema>) {
  const client = await (await db()).connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED")
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`litestats:user:${data.email}`])
    const passwordHash = await bcrypt.hash(data.password, 10)
    const created = await client.query<{id: number}>(
      `INSERT INTO users (email, name, password_hash, email_verified, theme, type, disabled, inserted_at, updated_at)
       VALUES ($1, $2, $3, false, 'system', 'standard', false, now(), now()) RETURNING id`,
      [data.email, data.name || data.email.split("@")[0], passwordHash],
    )
    const userId = created.rows[0]?.id
    if (!userId) throw new Error("无法创建账号")
    const team = await client.query<{id: number}>(
      "INSERT INTO teams (name, setup_complete, setup_at) VALUES ($1, true, now()) RETURNING id",
      [`${data.name || data.email.split("@")[0]} 的站点`],
    )
    if (!team.rows[0]) throw new Error("无法创建站点存储空间")
    await client.query(
      `INSERT INTO team_memberships (role, user_id, team_id, is_autocreated, inserted_at, updated_at)
       VALUES ('owner', $1, $2, true, now(), now())`,
      [userId, team.rows[0].id],
    )
    await client.query("COMMIT")
    return userId
  } catch (error) {
    await client.query("ROLLBACK")
    if ((error as {code?: string}).code === "23505") throw new Error("这个邮箱已经注册")
    throw error
  } finally {
    client.release()
  }
}

export async function registrationEnabled() {
  const result = await (await db()).query<{registration_enabled: boolean}>("SELECT registration_enabled FROM instance_auth_settings WHERE id=1")
  return result.rows[0]?.registration_enabled === true
}

export async function setRegistrationEnabled(enabled: boolean) {
  await (await db()).query("UPDATE instance_auth_settings SET registration_enabled=$2, updated_at=now() WHERE id=1", [enabled])
}

export async function registerPublicUser(input: unknown) {
  if (!await registrationEnabled()) throw new Error("当前未开放注册")
  return createStandardUser(registrationSchema.parse(input))
}

export async function createManagedUser(input: unknown) {
  return createStandardUser(registrationSchema.parse(input))
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const result = await (await db()).query<ManagedUser>(`
    SELECT id, email, name, COALESCE(type, 'standard') AS type, COALESCE(disabled, false) AS disabled,
      COALESCE(totp_enabled, false) AS totp_enabled, inserted_at
    FROM users ORDER BY inserted_at DESC, id DESC`)
  return result.rows.map(user => ({...user, inserted_at: new Date(user.inserted_at).toISOString()}))
}

async function targetUser(client: {query: (text: string, values?: unknown[]) => Promise<{rows: Array<{id: number; type?: string; disabled?: boolean}>}>}, userId: number) {
  const result = await client.query("SELECT id, type, disabled FROM users WHERE id=$1 FOR UPDATE", [userId])
  const user = result.rows[0]
  if (!user) throw new Error("用户不存在")
  return user
}

function preventLastAdminRemoval(actorId: number, userId: number, target: {type?: string; disabled?: boolean}, demoting: boolean) {
  if (actorId === userId && demoting) throw new Error("不能停用、降级或删除当前登录的管理员账号")
  if (target.type === "admin" && !target.disabled && demoting) throw new Error("至少保留一名可用的实例管理员")
}

export async function setManagedUserDisabled(actorId: number, userId: number, disabled: boolean) {
  const client = await (await db()).connect()
  try {
    await client.query("BEGIN")
    const target = await targetUser(client, userId)
    if (disabled) {
      preventLastAdminRemoval(actorId, userId, target, true)
      const admins = await client.query("SELECT count(*) AS count FROM users WHERE type='admin' AND NOT disabled AND id<>$1", [userId])
      if (target.type === "admin" && !target.disabled && Number(admins.rows[0].count) === 0) throw new Error("至少保留一名可用的实例管理员")
    }
    await client.query("UPDATE users SET disabled=$2, session_version=session_version+1, updated_at=now() WHERE id=$1", [userId, disabled])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}

export async function setManagedUserRole(actorId: number, userId: number, role: "standard" | "admin") {
  const client = await (await db()).connect()
  try {
    await client.query("BEGIN")
    const target = await targetUser(client, userId)
    if (role !== "admin") {
      preventLastAdminRemoval(actorId, userId, target, true)
      const admins = await client.query("SELECT count(*) AS count FROM users WHERE type='admin' AND NOT disabled AND id<>$1", [userId])
      if (target.type === "admin" && !target.disabled && Number(admins.rows[0].count) === 0) throw new Error("至少保留一名可用的实例管理员")
    }
    await client.query("UPDATE users SET type=$2, session_version=session_version+1, updated_at=now() WHERE id=$1", [userId, role])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}

export async function resetManagedUserPassword(userId: number) {
  const password = randomBytes(12).toString("base64url")
  const hash = await bcrypt.hash(password, 10)
  const result = await (await db()).query("UPDATE users SET password_hash=$2, session_version=session_version+1, updated_at=now() WHERE id=$1", [userId, hash])
  if (!result.rowCount) throw new Error("用户不存在")
  return password
}

export async function deleteManagedUser(actorId: number, userId: number) {
  const client = await (await db()).connect()
  try {
    await client.query("BEGIN")
    const target = await targetUser(client, userId)
    preventLastAdminRemoval(actorId, userId, target, true)
    const admins = await client.query("SELECT count(*) AS count FROM users WHERE type='admin' AND NOT disabled AND id<>$1", [userId])
    if (target.type === "admin" && !target.disabled && Number(admins.rows[0].count) === 0) throw new Error("至少保留一名可用的实例管理员")
    await client.query("DELETE FROM users WHERE id=$1", [userId])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}
