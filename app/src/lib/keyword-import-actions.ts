import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { findSiteForUser } from "./db"
import { requireUser } from "./session"
import { keywordImportInputSchema, parseKeywordCsv } from "./keyword-import"
import { listKeywordImports, readKeywordImport, saveKeywordImport } from "./keyword-import-store"

const listInput = z.object({domain: z.string().trim().min(1).max(255), provider: z.enum(["google", "bing"]).optional()})
const batchInput = z.object({domain: z.string().trim().min(1).max(255), id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)})
type Dependencies = {
  requireUser: () => Promise<{id: number}>
  findSiteForUser: (userId: number, domain: string, access: "read" | "admin") => Promise<{id: number; role?: string} | null>
  save: typeof saveKeywordImport
  list: typeof listKeywordImports
  read: typeof readKeywordImport
}

/** The same authenticated handlers power server functions and isolated authorization tests. */
export function createKeywordImportHandlers(deps: Dependencies) {
  async function permittedSite(domain: string, access: "read" | "admin") {
    const user = await deps.requireUser()
    const site = await deps.findSiteForUser(user.id, domain, access)
    if (!site) throw new Error("站点不存在或没有权限")
    return {user, site}
  }
  return {
    async import(input: unknown) {
      const data = keywordImportInputSchema.parse(input)
      const {user, site} = await permittedSite(data.domain, "admin")
      // Reparse the original CSV on the server; client-supplied metric arrays are never trusted.
      const rows = parseKeywordCsv(data.csvText)
      return deps.save({siteId: site.id, userId: user.id, provider: data.provider, from: data.from, to: data.to, rows})
    },
    async list(input: unknown) {
      const data = listInput.parse(input)
      const {site} = await permittedSite(data.domain, "read")
      const batches = await deps.list(site.id, data.provider)
      const latest = batches.length ? await deps.read(site.id, batches[0].id) : null
      return {batches, latest, canManage: ["owner", "admin"].includes(site.role || "")}
    },
    async read(input: unknown) {
      const data = batchInput.parse(input)
      const {site} = await permittedSite(data.domain, "read")
      const batch = await deps.read(site.id, data.id)
      if (!batch) throw new Error("导入记录不存在或不属于此站点")
      return batch
    },
  }
}

const handlers = createKeywordImportHandlers({requireUser, findSiteForUser, save: saveKeywordImport, list: listKeywordImports, read: readKeywordImport})
export const importKeywordsFn = createServerFn({method: "POST"})
  .validator((input: unknown) => keywordImportInputSchema.parse(input))
  .handler(({data}) => handlers.import(data))
export const keywordImportsFn = createServerFn({method: "GET"})
  .validator((input: unknown) => listInput.parse(input))
  .handler(({data}) => handlers.list(data))
export const keywordImportFn = createServerFn({method: "GET"})
  .validator((input: unknown) => batchInput.parse(input))
  .handler(({data}) => handlers.read(data))
