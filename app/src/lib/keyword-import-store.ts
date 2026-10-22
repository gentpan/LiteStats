import { db } from "./db"
import type { KeywordImportBatch, KeywordImportProvider, KeywordImportRow, KeywordImportSummary } from "./keyword-import"

type ImportInput = {
  siteId: number; userId: number; provider: KeywordImportProvider; from: string; to: string; rows: KeywordImportRow[]
}
const summaryColumns = `id, provider, date_from::text AS "from", date_to::text AS "to",
  row_count AS "rowCount", imported_at AS "importedAt"`
type StoredSummary = Omit<KeywordImportSummary, "importedAt"> & {importedAt: Date}
const summary = (row: StoredSummary): KeywordImportSummary => ({...row, importedAt: row.importedAt.toISOString()})

/** Dependency injection keeps persistence and schema-retry tests away from real databases. */
export function createKeywordImportStore(database = db) {
  let schema: Promise<void> | null = null
  async function keywordImportDb() {
    const pool = await database()
    if (!schema) schema = (async () => {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(716204, 4)")
        await client.query(`CREATE TABLE IF NOT EXISTS site_keyword_imports (
          id bigserial PRIMARY KEY,
          site_id bigint NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
          provider text NOT NULL CHECK (provider IN ('google', 'bing')),
          date_from date NOT NULL,
          date_to date NOT NULL CHECK (date_to >= date_from),
          rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
          row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 5000),
          imported_by bigint REFERENCES users(id) ON DELETE SET NULL,
          imported_at timestamptz NOT NULL DEFAULT now()
        )`)
        await client.query(`CREATE INDEX IF NOT EXISTS site_keyword_imports_site_time
          ON site_keyword_imports (site_id, imported_at DESC, id DESC)`)
        await client.query("COMMIT")
      } catch (error) {await client.query("ROLLBACK"); throw error}
      finally {client.release()}
    })().catch(error => {schema = null; throw error})
    await schema
    return pool
  }

  /** Each export is a new snapshot; overlapping periods never update or add to older batches. */
  async function save(input: ImportInput): Promise<KeywordImportBatch> {
    const result = await (await keywordImportDb()).query<StoredSummary>(`
      INSERT INTO site_keyword_imports (site_id, provider, date_from, date_to, rows, row_count, imported_by)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING ${summaryColumns}`,
    [input.siteId, input.provider, input.from, input.to, JSON.stringify(input.rows), input.rows.length, input.userId])
    return {...summary(result.rows[0]), rows: input.rows}
  }

  /** Caller must authorize membership before accessing site-scoped import data. */
  async function list(siteId: number, provider?: KeywordImportProvider): Promise<KeywordImportSummary[]> {
    const result = await (await keywordImportDb()).query<StoredSummary>(`
      SELECT ${summaryColumns} FROM site_keyword_imports
      WHERE site_id = $1 AND ($2::text IS NULL OR provider = $2)
      ORDER BY imported_at DESC, id DESC LIMIT 30`, [siteId, provider || null])
    return result.rows.map(summary)
  }

  async function read(siteId: number, id: number): Promise<KeywordImportBatch | null> {
    const result = await (await keywordImportDb()).query<StoredSummary & {rows: KeywordImportRow[]}>(`
      SELECT ${summaryColumns}, rows FROM site_keyword_imports WHERE site_id = $1 AND id = $2 LIMIT 1`, [siteId, id])
    const record = result.rows[0]
    return record ? {...summary(record), rows: record.rows} : null
  }
  return {save, list, read}
}

const store = createKeywordImportStore()
export const saveKeywordImport = store.save
export const listKeywordImports = store.list
export const readKeywordImport = store.read
