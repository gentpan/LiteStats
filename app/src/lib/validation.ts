import { z } from "zod"
export const text = z.string().max(8192)
const shortText = z.string().max(255)
const identifier = z.number().int().positive()
export const dashboardSchema = z.object({
  domain: shortText, period: z.enum(["realtime","today","yesterday","24h","7d","28d","91d","month","last_month","year","12mo","all","custom"]).optional(),
  days: z.number().int().min(-1).max(3660).optional(),
  from: shortText.optional(), to: shortText.optional(), interval: z.enum(["minute","hour","day","week","month"]).optional(),
  propKey: shortText.optional(), funnelId: identifier.optional(), source: text.optional(), page: text.optional(),
  country: shortText.optional(), browser: shortText.optional(), os: shortText.optional(), device: shortText.optional(),
  goalId: identifier.optional(), hostname: shortText.optional(), utm: shortText.optional(),
})
