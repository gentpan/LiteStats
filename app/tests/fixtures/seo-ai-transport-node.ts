// Exercise Node's production TLS/POST/abort path against a synthetic loopback server.
import assert from "node:assert/strict"
import dns from "node:dns/promises"
import https from "node:https"
import { syncBuiltinESMExports } from "node:module"
import { mock } from "node:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import type { AddressInfo, LookupFunction } from "node:net"
import { requestSeoAi } from "../../src/lib/seo-ai-transport"
import type { KeywordSeoData, SeoAiConfig } from "../../src/lib/seo-ai"

const directory = mkdtempSync(join(tmpdir(), "litestats-seo-tls-"))
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"), "-days", "2", "-subj", "/CN=model.example.com", "-addext", "subjectAltName=DNS:model.example.com"], {stdio: "ignore"})
const key = readFileSync(join(directory, "key.pem")), cert = readFileSync(join(directory, "cert.pem"))
const config: SeoAiConfig = {endpoint: "https://model.example.com/v1/chat/completions", model: "fixture", apiKey: "synthetic-secret", tokenParameter: "max_completion_tokens"}
const data: KeywordSeoData = {provider: "google", scopeLabel: "Fixture", rows: [{query: "analytics", clicks: 1, impressions: 5, ctr: .2, position: 2}]}
let requests = 0
const server = https.createServer({key, cert}, (req, res) => {
  requests++
  assert.equal(req.method, "POST")
  assert.equal(req.headers.authorization, `Bearer ${config.apiKey}`)
  const chunks: Buffer[] = []
  req.on("data", chunk => chunks.push(chunk))
  req.on("end", () => {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    assert.equal(payload.stream, false)
    assert.equal(payload.max_completion_tokens, 2000)
    assert(!JSON.stringify(payload.messages).includes(config.apiKey))
    if (req.url?.startsWith("/redirect/")) { res.writeHead(307, {Location: "https://other.example.com/v1/chat/completions"}); res.end(); return }
    if (req.url?.startsWith("/slow/")) {res.writeHead(200); res.write('{"partial":'); return}
    if (req.url?.startsWith("/large/")) {res.end(JSON.stringify("x".repeat(512 * 1024))); return}
    res.end(JSON.stringify({ok: true}))
  })
})
server.on("tlsClientError", () => {})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const port = (server.address() as AddressInfo).port
let answers = [{address: "1.1.1.1", family: 4}], lookups = 0, connections = 0, trusted = true, rebind = false, dnsHang = false
const original = https.request
mock.method(dns, "lookup", async () => {lookups++; return dnsHang ? new Promise(() => {}) : answers})
mock.method(https, "request", ((url: URL, options: https.RequestOptions, callback: Parameters<typeof original>[2]) => {
  connections++
  assert.equal(options.rejectUnauthorized, true)
  assert.equal(options.agent, false)
  const validated = answers
  if (rebind) answers = [{address: "127.0.0.1", family: 4}]
  const lookup: LookupFunction = (host, lookupOptions, done) => options.lookup!(host, lookupOptions, (error, pinned) => {
    assert.equal(error, null)
    assert.deepEqual(pinned, validated, "Socket must use the previously validated snapshot despite later DNS changes")
    done(null, [{address: "127.0.0.1", family: 4}])
  })
  const target = new URL(url); target.port = String(port)
  return original(target, {...options, lookup, ca: trusted ? cert : undefined}, callback)
}) as typeof https.request)
syncBuiltinESMExports()
try {
  rebind = true
  assert.deepEqual(await requestSeoAi(config, "site.example.com", data), {ok: true})
  assert.equal(lookups, 1)
  assert.equal(requests, 1)
  rebind = false; answers = [{address: "1.1.1.1", family: 4}]
  const beforeRedirect = connections
  await assert.rejects(requestSeoAi({...config, endpoint: "https://model.example.com/redirect/chat/completions"}, "site.example.com", data), {code: "request_failed"})
  assert.equal(connections, beforeRedirect + 1, "Redirect must not create another authenticated request")
  const beforePrivate = connections
  answers = [{address: "1.1.1.1", family: 4}, {address: "127.0.0.1", family: 4}]
  await assert.rejects(requestSeoAi(config, "site.example.com", data), {code: "request_failed"})
  assert.equal(connections, beforePrivate)
  answers = [{address: "1.1.1.1", family: 4}]; trusted = false
  const beforeTls = requests
  await assert.rejects(requestSeoAi(config, "site.example.com", data), {code: "request_failed"})
  assert.equal(requests, beforeTls, "An untrusted certificate must prevent HTTP credentials being sent")
  trusted = true
  await assert.rejects(requestSeoAi({...config, endpoint: "https://model.example.com/large/chat/completions"}, "site.example.com", data), {code: "invalid_response"})
  const start = performance.now()
  await assert.rejects(requestSeoAi({...config, endpoint: "https://model.example.com/slow/chat/completions"}, "site.example.com", data, {timeoutMs: 100}), {code: "request_timeout"})
  assert(performance.now() - start < 1000)
  dnsHang = true
  const beforeDns = connections
  await assert.rejects(requestSeoAi(config, "site.example.com", data, {timeoutMs: 50}), {code: "request_timeout"})
  assert.equal(connections, beforeDns)
  console.log("PASS: model transport TLS, POST, pinned DNS/rebinding, private DNS, redirects, body limits and DNS/body deadlines")
} finally {
  mock.restoreAll(); syncBuiltinESMExports()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  rmSync(directory, {recursive: true, force: true})
}
