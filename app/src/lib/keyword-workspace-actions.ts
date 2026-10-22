import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { isDateRange } from "./date-time"
import { findSiteForUser } from "./db"
import { requireUser } from "./session"
import { searchTermsForSite } from "./keywords"
import { readKeywordImport } from "./keyword-import-store"
import { generateSeoForSite } from "./seo-ai-store"
import { seoAiExpectedConfigSchema, type KeywordSeoData } from "./seo-ai"

const liveInput = z.object({
  domain: z.string().min(1).max(255), provider: z.enum(["google", "bing"]),
  from: z.string(), to: z.string(),
}).refine(data => isDateRange(data.from, data.to), "请选择有效的日期范围")
const generateInput = z.union([
  liveInput.safeExtend({source: z.literal("live"), expectedConfig: seoAiExpectedConfigSchema}),
  z.object({domain: z.string().min(1).max(255), source: z.literal("import"), id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), expectedConfig: seoAiExpectedConfigSchema}),
])

type Dependencies = {
  user: typeof requireUser
  site: (...args: Parameters<typeof findSiteForUser>) => Promise<Awaited<ReturnType<typeof findSiteForUser>> | null>
  terms: typeof searchTermsForSite
  batch: typeof readKeywordImport
  generate: typeof generateSeoForSite
}

/** The client chooses a source, never supplies the metrics sent to the model. */
export function createKeywordWorkspaceHandlers(deps: Dependencies) {
  async function siteFor(domain: string, access: "read" | "admin") {
    const user = await deps.user()
    const site = await deps.site(user.id, domain, access)
    if (!site) throw new Error("站点不存在或没有权限")
    return site
  }
  async function live(data: z.infer<typeof liveInput>, siteId: number) {
    const terms = await deps.terms(siteId, {from: data.from, to: data.to}, [])
    return terms[data.provider]
  }
  return {
    async live(input: unknown) {
      const data = liveInput.parse(input)
      const site = await siteFor(data.domain, "read")
      return live(data, site.id)
    },
    async generate(input: unknown) {
      const data = generateInput.parse(input)
      const site = await siteFor(data.domain, "admin")
      let snapshot: KeywordSeoData
      if (data.source === "import") {
        const batch = await deps.batch(site.id, data.id)
        if (!batch) throw new Error("导入记录不存在或不属于此站点")
        snapshot = {provider: batch.provider, from: batch.from, to: batch.to,
          scopeLabel: `CSV 导入 #${batch.id}，管理员声明的导出范围；仅分析导入的关键词，不代表整站全部搜索。`, rows: batch.rows}
      } else {
        const pack = await live(data, site.id)
        if (!pack.configured || pack.error) throw new Error("关键词读取失败，请先连接搜索平台并确认报表可用")
        snapshot = {provider: data.provider,
          ...(data.provider === "google" ? {from: data.from, to: data.to} : {}),
          scopeLabel: (data.provider === "google"
            ? "Google Search Console 所选资源，太平洋时间，按点击量返回的前 50 个词；不含平台隐藏的查询。"
            : "Bing 所选资源的接口可用关键词，按周更新，不能按所选日期筛选；记录日期不代表精确覆盖范围。") + (pack.report?.resource ? ` ${pack.report.resource}` : ""),
          rows: pack.metrics || [],
        }
      }
      snapshot.rows = [...snapshot.rows].sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1) || (b.clicks ?? -1) - (a.clicks ?? -1)).slice(0, 50)
      return deps.generate(site.id, site.domain, snapshot, data.expectedConfig)
    },
  }
}
const handlers = createKeywordWorkspaceHandlers({user: requireUser, site: findSiteForUser, terms: searchTermsForSite, batch: readKeywordImport, generate: generateSeoForSite})
export const keywordLiveFn = createServerFn({method: "GET"}).validator((input: unknown) => liveInput.parse(input)).handler(({data}) => handlers.live(data))
export const generateKeywordSeoFn = createServerFn({method: "POST"}).validator((input: unknown) => generateInput.parse(input)).handler(({data}) => handlers.generate(data))
