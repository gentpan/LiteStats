import bcrypt from "bcryptjs"
import type pg from "pg"
import { z } from "zod"

export const instanceSetupSchema = z.object({
  email: z.string().trim().max(255).email("邮箱不正确").transform(value => value.toLowerCase()),
  password: z.string().min(8, "密码至少 8 位").max(8192),
  name: z.string().trim().max(255),
})

type SetupAdmin = {
  id: number
  email: string
  name: string
  type: "admin"
  email_verified: boolean
}

export class InstanceAlreadyInitializedError extends Error {
  constructor() {
    super("实例已完成初始化，请使用管理员账号登录")
    this.name = "InstanceAlreadyInitializedError"
  }
}

/** Persistent bootstrap authority follows the account ID, including after an email change. */
export function hasInstanceAdminAccess(user: { type?: string; email: string; email_verified?: boolean }, adminEmails: string[]) {
  return user.type === "admin" || (user.email_verified === true && adminEmails.includes(user.email.toLowerCase()))
}

/** All account creation paths must use this transaction, including development seeding. */
export function createInstanceSetupStore(database: () => Promise<pg.Pool>, hashPassword = (password: string) => bcrypt.hash(password, 10)) {
  return {
    async needsSetup() {
      const result = await (await database()).query<{ needs_setup: boolean }>(
        "SELECT NOT EXISTS (SELECT 1 FROM users) AS needs_setup",
      )
      return result.rows[0]?.needs_setup === true
    },
    async create(input: unknown): Promise<SetupAdmin> {
      const data = instanceSetupSchema.parse(input)
      const client = await (await database()).connect()
      let transaction = false
      try {
        // READ COMMITTED is explicit: after waiting for the shared lock, the
        // count must see the winner's commit, even if the pool default differs.
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED")
        transaction = true
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["litestats:instance-admin-bootstrap"])
        const existing = await client.query<{ user_count: string | number }>("SELECT count(*) AS user_count FROM users")
        const count = existing.rows[0]?.user_count
        if (count !== "0" && count !== 0) {
          throw new InstanceAlreadyInitializedError()
        }
        const passwordHash = await hashPassword(data.password)
        const created = await client.query<SetupAdmin>(
          `INSERT INTO users (email, name, password_hash, email_verified, theme, type, inserted_at, updated_at)
           VALUES ($1, $2, $3, false, 'system', 'admin', now(), now())
           RETURNING id, email, name, type, email_verified`,
          [data.email, data.name || data.email.split("@")[0], passwordHash],
        )
        const user = created.rows[0]
        if (!user) throw new Error("无法创建管理员账号")
        const team = await client.query<{ id: number }>(
          "INSERT INTO teams (name, setup_complete, setup_at) VALUES ($1, true, now()) RETURNING id",
          [`${user.name} 的站点`],
        )
        if (!team.rows[0]) throw new Error("无法创建站点存储空间")
        await client.query(
          `INSERT INTO team_memberships (role, user_id, team_id, is_autocreated, inserted_at, updated_at)
           VALUES ('owner', $1, $2, true, now(), now())`,
          [user.id, team.rows[0].id],
        )
        await client.query("COMMIT")
        transaction = false
        return user
      } catch (error) {
        if (transaction) await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },
  }
}
