import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { db } from "./db"
import { SESSION_KEY } from "./env"
import { mapboxSettingsSchema, mapboxTokenSchema } from "./mapbox-validation"

type Stored = {enabled: boolean; encrypted: string}
const key = () => createHash("sha256").update(`litestats-mapbox:${SESSION_KEY}`).digest()
function encrypt(token: string) {
  if (!token) return ""
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(part => part.toString("base64")).join(":")
}
function decrypt(value: string) {
  const [iv, tag, data] = value.split(":").map(part => Buffer.from(part, "base64"))
  const cipher = createDecipheriv("aes-256-gcm", key(), iv)
  cipher.setAuthTag(tag)
  return mapboxTokenSchema.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"))
}
let ready: Promise<void> | undefined
export async function mapboxSettingsDb() {
  const pool = await db()
  await (ready ??= pool.query(`CREATE TABLE IF NOT EXISTS litestats_mapbox_settings (
    id integer PRIMARY KEY CHECK (id=1), enabled boolean NOT NULL DEFAULT false,
    encrypted text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
  )`).then(() => {}).catch(error => {ready = undefined; throw error}))
  return pool
}
async function read() {
  const result = await (await mapboxSettingsDb()).query<Stored>("SELECT enabled,encrypted FROM litestats_mapbox_settings WHERE id=1")
  return result.rows[0] || {enabled: false, encrypted: ""}
}
export async function getMapboxSettings() {
  const row = await read()
  return {enabled: row.enabled, configured: !!row.encrypted}
}
/** Only called after the dashboard's existing member/public/share authorization. */
export async function dashboardMapboxToken() {
  try {
    const row = await read()
    return row.enabled && row.encrypted ? decrypt(row.encrypted) : ""
  } catch {
    // An optional map integration must not take the analytics dashboard down.
    return ""
  }
}
export async function saveMapboxSettings(input: unknown) {
  const patch = mapboxSettingsSchema.parse(input)
  const client = await (await mapboxSettingsDb()).connect()
  try {
    await client.query("BEGIN")
    await client.query("INSERT INTO litestats_mapbox_settings(id) VALUES(1) ON CONFLICT DO NOTHING")
    const previous = (await client.query<Stored>("SELECT enabled,encrypted FROM litestats_mapbox_settings WHERE id=1 FOR UPDATE")).rows[0]
    const encrypted = patch.token === undefined ? previous.encrypted : encrypt(patch.token)
    if (patch.enabled && !encrypted) throw new Error("请先填写 Mapbox 公开 Token")
    await client.query("UPDATE litestats_mapbox_settings SET enabled=$1,encrypted=$2,updated_at=now() WHERE id=1", [patch.enabled, encrypted])
    await client.query("COMMIT")
    return {enabled: patch.enabled, configured: !!encrypted}
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release() }
}
