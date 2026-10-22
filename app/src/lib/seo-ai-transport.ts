import { request as httpsRequest } from "node:https"
import { connectionOptions, publicUrl } from "./site-check-network"
import { SeoAiError, seoAiConfigSchema, seoAiMessages, type KeywordSeoData, type SeoAiConfig } from "./seo-ai"

type TransportOptions = {
  timeoutMs?: number;
  connect?: typeof connectionOptions;
  request?: typeof httpsRequest;
}

/** Fixed POST with verified TLS, pinned public DNS, no redirects and bounded response. */
export async function requestSeoAi(config: SeoAiConfig, domain: string, data: KeywordSeoData, options: TransportOptions = {}): Promise<unknown> {
  const parsed = seoAiConfigSchema.safeParse(config)
  if (!parsed.success) throw new SeoAiError("endpoint_invalid")
  if (!parsed.data.apiKey) throw new SeoAiError("not_configured")
  let url: URL
  try { url = publicUrl(parsed.data.endpoint) } catch { throw new SeoAiError("endpoint_invalid") }
  const body = JSON.stringify({model: config.model, messages: seoAiMessages(domain, data), stream: false, [config.tokenParameter]: 2000})
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(options.timeoutMs ?? 45_000, 45_000)))
  try {
    const connection = await (options.connect || connectionOptions)(url.hostname, controller.signal)
    controller.signal.throwIfAborted()
    return await new Promise((resolve, reject) => {
      const request = (options.request || httpsRequest)(url, {
        ...connection, method: "POST", agent: false, rejectUnauthorized: true, signal: controller.signal,
        headers: {Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "identity", "Content-Length": Buffer.byteLength(body)},
      }, response => {
        const status = response.statusCode || 0
        if (status < 200 || status >= 300) {
          reject(new SeoAiError(status === 401 || status === 403 ? "auth_error" : status === 429 ? "rate_limited" : "request_failed"))
          response.destroy()
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > 512 * 1024) { reject(new SeoAiError("invalid_response")); response.destroy() }
          else chunks.push(chunk)
        })
        response.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))) }
          catch { reject(new SeoAiError("invalid_response")) }
        })
        response.on("error", reject)
        response.on("aborted", () => reject(new SeoAiError("request_failed")))
      })
      request.on("error", reject)
      request.end(body)
    })
  } catch (error) {
    if (controller.signal.aborted) throw new SeoAiError("request_timeout")
    throw error instanceof SeoAiError ? error : new SeoAiError("request_failed")
  } finally { clearTimeout(timer) }
}
