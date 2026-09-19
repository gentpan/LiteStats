import { z } from "zod"

export const smtpSchema = z.object({
  host: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["starttls", "tls"]),
  username: z.string().trim().max(255),
  password: z.string().max(4096),
  fromEmail: z.email().max(255),
  fromName: z.string().trim().max(100),
})
export const telegramSchema = z.object({
  token: z.string().trim().max(255).refine(value => !value || /^\d+:[A-Za-z0-9_-]+$/.test(value), "Bot Token 格式不正确"),
  chatId: z.string().trim().max(100).regex(/^(?:-?\d+|@[A-Za-z0-9_]+)$/, "Chat ID 格式不正确"),
})
export const channelInput = z.discriminatedUnion("channel", [
  z.object({channel:z.literal("smtp"),settings:smtpSchema}),
  z.object({channel:z.literal("telegram"),settings:telegramSchema}),
])
export type SmtpSettings = z.infer<typeof smtpSchema>
export type TelegramSettings = z.infer<typeof telegramSchema>
