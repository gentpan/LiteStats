import { z } from "zod"
import { db } from "./db"
import { DEFAULT_MAPBOX_STYLE, MAPBOX_STYLES, normalizeMapboxStyle, type MapboxStyleId } from "./mapbox-styles"
import { mapboxStyleIdSchema } from "./map-style-validation"
const userIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

/** A separate preference table leaves historical map configuration and keys untouched. */
export function createUserMapStyleStore(database = db) {
  let schema: Promise<void> | null = null
  async function preferencesDb() {
    const pool = await database()
    if (!schema) schema = (async () => {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["litestats:user-mapbox-preferences:schema"])
        // Every literal comes from the local fixed catalog, never a request value.
        const choices = MAPBOX_STYLES.map(style => `'${style.id}'`).join(", ")
        await client.query(`CREATE TABLE IF NOT EXISTS user_mapbox_preferences (
          user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          style_id text NOT NULL DEFAULT '${DEFAULT_MAPBOX_STYLE}' CHECK (style_id IN (${choices})),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query("COMMIT")
      } catch (error) {
        try { await client.query("ROLLBACK") } catch { /* Preserve the original initialization error. */ }
        throw error
      } finally { client.release() }
    })().catch(error => { schema = null; throw error })
    await schema
    return pool
  }

  async function get(userId: number): Promise<MapboxStyleId> {
    const id = userIdSchema.parse(userId)
    const result = await (await preferencesDb()).query<{style_id: string}>(
      "SELECT style_id FROM user_mapbox_preferences WHERE user_id=$1", [id],
    )
    // Missing or obsolete preferences have a safe display fallback, without rewriting a record.
    return normalizeMapboxStyle(result.rows[0]?.style_id)
  }

  async function save(userId: number, input: unknown): Promise<MapboxStyleId> {
    const id = userIdSchema.parse(userId)
    // Saving must reject invalid IDs, rather than quietly changing the user's choice.
    const styleId = mapboxStyleIdSchema.parse(input)
    await (await preferencesDb()).query(`
      INSERT INTO user_mapbox_preferences (user_id, style_id) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET style_id=EXCLUDED.style_id, updated_at=now()`, [id, styleId])
    return styleId
  }

  return {get, save}
}

const store = createUserMapStyleStore()
export const getUserMapStyle = store.get
export const saveUserMapStyle = store.save

/** Display preferences remain optional when their new table is temporarily unavailable. */
export async function rootMapStylePreference(user: {id: number} | null, read = getUserMapStyle): Promise<MapboxStyleId> {
  if (!user) return DEFAULT_MAPBOX_STYLE
  try { return await read(user.id) }
  catch { return DEFAULT_MAPBOX_STYLE }
}
