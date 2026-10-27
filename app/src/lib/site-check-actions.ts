import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { findSiteForUser } from "./db"
import { requireUser } from "./session"
import { runSiteCheck, siteCheckReport } from "./site-checks"

const siteInput = z.object({domain: z.string().min(1).max(255)})
async function permittedSite(domain: string, manage = false) {
  const user = await requireUser()
  const site = await findSiteForUser(user.id, domain, manage ? "admin" : "read")
  if (!site) throw new Error("站点不存在或没有权限")
  return site
}

export const siteCheckFn = createServerFn({method: "GET"})
  .validator((input: unknown) => siteInput.parse(input))
  .handler(async ({data}) => {
    const site = await permittedSite(data.domain)
    return {report: await siteCheckReport(site), canManage: ["owner", "admin"].includes(site.role || "")}
  })

export const runSiteCheckFn = createServerFn({method: "POST"})
  .validator((input: unknown) => siteInput.parse(input))
  .handler(async ({data}) => {
    const site = await permittedSite(data.domain, true)
    if (!await runSiteCheck(site.id, true)) throw new Error("请开启检查，并与上次检查间隔至少一分钟")
    return {ok: true}
  })
