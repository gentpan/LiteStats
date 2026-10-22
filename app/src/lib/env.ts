export const DATABASE_URL = process.env.DATABASE_URL || "postgres://litestats:litestats@127.0.0.1:5435/litestats?sslmode=disable"
export const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || "http://127.0.0.1:8123/default"
export const SESSION_KEY = process.env.SESSION_KEY || "litestats-dev-session-key-change-me"
export const SEED_DEMO = process.env.SEED_DEMO === "true" && process.env.NODE_ENV !== "production"
export const DEFAULT_ADMIN_EMAIL = "demo@litestats.dev"
export const DEFAULT_ADMIN_PASSWORD = "12345678"
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || (SEED_DEMO ? DEFAULT_ADMIN_EMAIL : "")).split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
if (process.env.NODE_ENV === "production" && (SESSION_KEY.length < 32 || /change.me|dev-session/i.test(SESSION_KEY))) {
  throw new Error("生产环境必须设置至少 32 位随机 SESSION_KEY")
}
