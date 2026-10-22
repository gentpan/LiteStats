import { z } from "zod"
import { canonicalTimezone, isCalendarDate, isDateRange } from "./date-time"
import { PERIODS, searchPeriod } from "./range"

export const text = z.string().max(8192)
const shortText = z.string().max(255)
const identifier = z.number().int().positive()
export const timezoneSchema = z.string().trim().max(64).transform((value, ctx) => {
  const zone = canonicalTimezone(value)
  if (zone) return zone
  ctx.addIssue({code: "custom", message: "请选择有效的时区"})
  return z.NEVER
})
const dateInput = z.string().refine(value => isCalendarDate(value) || value === "realtime" || value === "last24h", "日期无效，请使用 YYYY-MM-DD 格式的真实日期")

export const dashboardSchema = z.object({
  domain: shortText, period: z.enum(PERIODS).optional(),
  days: z.number().int().min(-1).max(3660).optional(),
  from: dateInput.optional(), to: dateInput.optional(), interval: z.enum(["minute","hour","day","week","month"]).optional(),
  propKey: shortText.optional(), funnelId: identifier.optional(), source: text.optional(), page: text.optional(),
  country: shortText.optional(), browser: shortText.optional(), os: shortText.optional(), device: shortText.optional(),
  goalId: identifier.optional(), hostname: shortText.optional(), utm: shortText.optional(),
}).superRefine((data, ctx) => {
  const period = searchPeriod(data)
  if (period === "custom" && !isDateRange(data.from, data.to)) {
    ctx.addIssue({code: "custom", path: ["to"], message: "请选择完整的有效日期范围，结束日期不能早于开始日期"})
  } else if (isCalendarDate(data.from) && isCalendarDate(data.to) && data.from > data.to) {
    ctx.addIssue({code: "custom", path: ["to"], message: "结束日期不能早于开始日期"})
  }
  const sentinel = period === "realtime" ? "realtime" : period === "24h" ? "last24h" : null
  const hasSentinel = [data.from, data.to].some(value => value === "realtime" || value === "last24h")
  if (hasSentinel) {
    for (const key of ["from", "to"] as const) {
      if (data[key] !== undefined && data[key] !== sentinel) {
        ctx.addIssue({code: "custom", path: [key], message: "日期范围与统计周期不一致"})
      }
    }
  }
})
