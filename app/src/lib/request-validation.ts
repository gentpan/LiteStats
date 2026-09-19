import { z } from "zod"

const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])
export const eventSchema = z.object({
  d: z.string().max(255).optional(), domain: z.string().max(255).optional(),
  u: z.url().max(8192).optional(), url: z.url().max(8192).optional(),
  n: z.string().min(1).max(255).optional(), name: z.string().min(1).max(255).optional(),
  p: z.record(z.string().max(300), scalar).optional(), props: z.record(z.string().max(300), scalar).optional(),
  m: z.record(z.string().max(300), scalar).optional(), meta: z.record(z.string().max(300), scalar).optional(),
}).passthrough()
export const monitorSchema = z.object({
  id: z.string().min(1).max(64), secret: z.string().min(1).max(255),
  metrics: z.record(z.string().max(100), scalar),
}).strict()

export async function readJson(request: Request, maxBytes = 65536): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new Error("请求过大")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("请求为空")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw new Error("请求过大") }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}
