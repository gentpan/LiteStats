import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { findSiteForUser } from "./db"
import { requireUser } from "./session"
import { seoAiConfigSchema } from "./seo-ai"
import { removeSeoAiConfig, saveSeoAiConfig, seoAiHistory, seoAiPublicConfig } from "./seo-ai-store"

const siteInput = z.object({domain: z.string().min(1).max(255)})
async function adminSite(domain: string) {
  const user = await requireUser()
  const site = await findSiteForUser(user.id, domain, "admin")
  if (!site) throw new Error("站点不存在或没有管理权限")
  return site
}

export const seoAiSettingsFn = createServerFn({method: "GET"})
  .validator((input: unknown) => siteInput.parse(input))
  .handler(async ({data}) => seoAiPublicConfig((await adminSite(data.domain)).id))

export const saveSeoAiSettingsFn = createServerFn({method: "POST"})
  .validator((input: unknown) => siteInput.extend(seoAiConfigSchema.shape).parse(input))
  .handler(async ({data}) => saveSeoAiConfig((await adminSite(data.domain)).id, data))

export const seoAiHistoryFn = createServerFn({method: "GET"})
  .validator((input: unknown) => siteInput.parse(input))
  .handler(async ({data}) => seoAiHistory((await adminSite(data.domain)).id))

export const removeSeoAiSettingsFn = createServerFn({method: "POST"})
  .validator((input: unknown) => siteInput.parse(input))
  .handler(async ({data}) => removeSeoAiConfig((await adminSite(data.domain)).id))
