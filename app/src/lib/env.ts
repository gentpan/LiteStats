export const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:5435/plausible_dev?sslmode=disable"
export const CLICKHOUSE_URL =
  process.env.CLICKHOUSE_URL || "http://127.0.0.1:8123/plausible_events_db"
export const SESSION_KEY = process.env.SESSION_KEY || "litestats-dev-session-key-change-me"
export const DEFAULT_ADMIN_EMAIL = "demo@litestats.dev"
export const DEFAULT_ADMIN_PASSWORD = "12345678"
