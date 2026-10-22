import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { request as httpsRequest } from "node:https"
import type { connectionOptions } from "../src/lib/site-check-network"
import { requestSeoAi } from "../src/lib/seo-ai-transport"
import { type KeywordSeoData, type SeoAiConfig } from "../src/lib/seo-ai"

const config: SeoAiConfig = {endpoint: "https://api.example.com/v1/chat/completions", model: "test-model", apiKey: "secret-fixture", tokenParameter: "max_completion_tokens"}
const data: KeywordSeoData = {provider: "bing", scopeLabel: "接口可用范围", rows: [{query: "site stats", clicks: 1, impressions: null, ctr: null, position: null}]}
const connect: typeof connectionOptions = async () => ({
  autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250,
  lookup: (_host, options, callback) => options.all ? callback(null, [{address: "93.184.216.34", family: 4}]) : callback(null, "93.184.216.34", 4),
})

function network(status = 200, body = '{"ok":true}', stall = false) {
  const calls: {url: string; options: Record<string, unknown>; body: string}[] = []
  const request = ((url: URL, options: Record<string, unknown>, callback: (response: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & {end: (body: string) => void}
    const signal = options.signal as AbortSignal
    const abort = () => req.emit("error", new Error("aborted with secret-fixture"))
    signal.addEventListener("abort", abort, {once: true})
    req.end = payload => {
      calls.push({url: url.href, options, body: payload})
      if (stall) return
      queueMicrotask(() => {
        const response = new EventEmitter() as EventEmitter & {statusCode: number; destroy: () => void}
        response.statusCode = status
        let destroyed = false
        response.destroy = () => { destroyed = true }
        callback(response)
        if (!destroyed) response.emit("data", Buffer.from(body))
        if (!destroyed) response.emit("end")
        signal.removeEventListener("abort", abort)
      })
    }
    return req
  }) as unknown as typeof httpsRequest
  return {calls, request}
}

test("AI transport sends verified TLS POST with selected token field and no automatic redirects", async () => {
  for (const tokenParameter of ["max_tokens", "max_completion_tokens"] as const) {
    const mock = network()
    expect(await requestSeoAi({...config, tokenParameter}, "example.com", data, {connect, request: mock.request})).toEqual({ok: true})
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0].options).toMatchObject({method: "POST", agent: false, rejectUnauthorized: true})
    const body = JSON.parse(mock.calls[0].body)
    expect(body[tokenParameter]).toBe(2000)
    expect(body.stream).toBe(false)
    expect(body.messages[1].content).not.toContain("secret-fixture")
  }
  const redirect = network(302)
  await expect(requestSeoAi(config, "example.com", data, {connect, request: redirect.request})).rejects.toMatchObject({code: "request_failed"})
  expect(redirect.calls).toHaveLength(1)
})

test("AI transport distinguishes auth, rate limits, timeout, invalid JSON and oversized bodies", async () => {
  for (const [status, code] of [[401, "auth_error"], [403, "auth_error"], [429, "rate_limited"], [500, "request_failed"]] as const) {
    const mock = network(status, 'secret-fixture')
    await expect(requestSeoAi(config, "example.com", data, {connect, request: mock.request})).rejects.toMatchObject({code})
  }
  for (const body of ["not JSON secret-fixture", "x".repeat(512 * 1024 + 1)]) {
    const mock = network(200, body)
    await expect(requestSeoAi(config, "example.com", data, {connect, request: mock.request})).rejects.toMatchObject({code: "invalid_response"})
  }
  const mock = network(200, "", true)
  await expect(requestSeoAi(config, "example.com", data, {connect, request: mock.request, timeoutMs: 5})).rejects.toMatchObject({code: "request_timeout"})
})

test("AI transport rejects private addresses before transmitting credentials", async () => {
  const mock = network()
  for (const endpoint of ["https://127.0.0.1/v1/chat/completions", "https://10.0.0.1/v1/chat/completions", "https://[::1]/v1/chat/completions", "https://169.254.169.254/v1/chat/completions"]) {
    await expect(requestSeoAi({...config, endpoint}, "example.com", data, {connect, request: mock.request})).rejects.toMatchObject({code: "endpoint_invalid"})
  }
  expect(mock.calls).toHaveLength(0)
  const rejectedDns: typeof connectionOptions = async () => {throw new Error("域名没有可安全访问的公网地址")}
  await expect(requestSeoAi(config, "example.com", data, {connect: rejectedDns, request: mock.request})).rejects.toMatchObject({code: "request_failed"})
  expect(mock.calls).toHaveLength(0)
})
