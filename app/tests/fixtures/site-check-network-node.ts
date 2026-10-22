// Run in a separate Node process: exercise the production socket implementation
// against loopback fixtures without changing the application's public-IP policy.
import assert from "node:assert/strict"
import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import tls from "node:tls"
import { syncBuiltinESMExports } from "node:module"
import { mock } from "node:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import type { LookupFunction, AddressInfo } from "node:net"
import { requestPublic, inspectCertificate } from "../../src/lib/site-check-network"

const directory = mkdtempSync(join(tmpdir(), "litestats-network-test-"))
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"), "-days", "2", "-subj", "/CN=fallback.example.com", "-addext", "subjectAltName=DNS:fallback.example.com"], {stdio: "ignore"})
const key = readFileSync(join(directory, "key.pem")), cert = readFileSync(join(directory, "cert.pem"))
const plain = http.createServer((req, res) => {if (req.url !== "/hang") {res.statusCode = req.url === "/bad" ? 503 : 200; res.end("ok")}})
const secure = https.createServer({key, cert}, (_req, res) => {res.end("ok")})
secure.on("tlsClientError", () => {})
await Promise.all([new Promise<void>(resolve => plain.listen(0, "127.0.0.1", resolve)), new Promise<void>(resolve => secure.listen(0, "127.0.0.1", resolve))])
const plainPort = (plain.address() as AddressInfo).port, securePort = (secure.address() as AddressInfo).port
let answers = [{address: "2606:4700:4700::1111", family: 6}, {address: "1.1.1.1", family: 4}]
let lookups = 0, connections = 0, trust = true
const originalHttp = http.request, originalHttps = https.request, originalConnect = tls.connect
const mapAddress = (address: string) => address === "1.1.1.1" ? "127.0.0.1" : address === "8.8.8.8" ? "127.0.0.2" : "::1"
const mappedLookups = new WeakSet<LookupFunction>()
function localLookup(lookup: LookupFunction): LookupFunction {
  if (mappedLookups.has(lookup)) return lookup
  const mapped: LookupFunction = (host, options, callback) => {
    assert.equal(options.all, true, "Native address fallback must request the full pinned list")
    lookup(host, options, (error, result, family) => {
      if (error) return callback(error, result, family)
      assert.ok(Array.isArray(result))
      assert.deepEqual(result, answers, "Every native fallback uses only the validated DNS snapshot")
      callback(null, result.map(answer => ({...answer, address: mapAddress(answer.address)})))
    })
  }
  mappedLookups.add(mapped)
  return mapped
}
mock.method(dns, "lookup", async () => {lookups++; return answers})
mock.method(http, "request", ((url: URL, options: http.RequestOptions & {autoSelectFamily?: boolean}, callback: Parameters<typeof originalHttp>[2]) => {
  connections++
  assert.equal(options.autoSelectFamily, true)
  const target = new URL(url); target.port = String(plainPort)
  return originalHttp(target, {...options, lookup: localLookup(options.lookup!)}, callback)
}) as typeof http.request)
mock.method(https, "request", ((url: URL, options: https.RequestOptions & {autoSelectFamily?: boolean}, callback: Parameters<typeof originalHttps>[2]) => {
  connections++
  assert.equal(options.autoSelectFamily, true)
  const target = new URL(url); target.port = String(securePort)
  return originalHttps(target, {...options, ca: trust ? cert : undefined, lookup: localLookup(options.lookup!)}, callback)
}) as typeof https.request)
mock.method(tls, "connect", ((options: tls.ConnectionOptions & {autoSelectFamily?: boolean}) => {
  connections++
  assert.equal(options.host, "fallback.example.com")
  assert.equal(options.servername, "fallback.example.com", "Keep the hostname for SNI and identity checks")
  assert.equal(options.autoSelectFamily, true)
  return originalConnect({...options, port: securePort, ca: trust ? cert : undefined, lookup: localLookup(options.lookup!)})
}) as typeof tls.connect)
syncBuiltinESMExports()
const signal = () => AbortSignal.timeout(1500)
try {
  for (const candidates of [
    [{address: "2606:4700:4700::1111", family: 6}, {address: "1.1.1.1", family: 4}],
    [{address: "1.1.1.1", family: 4}, {address: "2606:4700:4700::1111", family: 6}],
    [{address: "8.8.8.8", family: 4}, {address: "1.1.1.1", family: 4}],
  ]) {
    answers = candidates
    assert.equal((await requestPublic(new URL("http://fallback.example.com/"), signal())).status, 200)
    assert.equal((await requestPublic(new URL("https://fallback.example.com/"), signal())).status, 200)
    const certificate = await inspectCertificate("fallback.example.com", signal())
    assert.equal(certificate.valid, true)
    assert.ok(certificate.expiresAt)
  }
  assert.equal(lookups, 9, "No fallback performs a second, unchecked DNS resolution")
  assert.equal((await requestPublic(new URL("http://fallback.example.com/bad"), signal())).status, 503, "A reachable server's error status is not masked")
  trust = false
  await assert.rejects(requestPublic(new URL("https://fallback.example.com/"), signal()), /self.signed|certificate/i)
  const untrusted = await inspectCertificate("fallback.example.com", signal())
  assert.equal(untrusted.valid, false)
  assert.ok(untrusted.expiresAt)
  assert.ok(untrusted.error)
  trust = true
  answers = [{address: "2606:4700:4700::1111", family: 6}, {address: "8.8.8.8", family: 4}]
  await assert.rejects(requestPublic(new URL("http://fallback.example.com/"), signal()))
  await assert.rejects(inspectCertificate("fallback.example.com", signal()))
  answers = [{address: "1.1.1.1", family: 4}, {address: "127.0.0.1", family: 4}]
  const before = connections
  await assert.rejects(requestPublic(new URL("http://fallback.example.com/"), signal()), /公网地址/)
  await assert.rejects(inspectCertificate("fallback.example.com", signal()), /公网地址/)
  assert.equal(connections, before, "Mixed public/private answers must fail before any socket opens")
  answers = [{address: "1.1.1.1", family: 4}]
  const start = performance.now()
  await assert.rejects(requestPublic(new URL("http://fallback.example.com/hang"), AbortSignal.timeout(100)), /abort/i)
  assert.ok(performance.now() - start < 1000, "The total deadline remains in force")
  console.log("PASS: Node HTTP/HTTPS/TLS address fallback, both address orders, same-family fallback, DNS pinning, private-IP rejection, certificate validation, HTTP errors and total timeout")
} finally {
  mock.restoreAll(); syncBuiltinESMExports()
  plain.closeAllConnections(); secure.closeAllConnections()
  await Promise.all([new Promise<void>(resolve => plain.close(() => resolve())), new Promise<void>(resolve => secure.close(() => resolve()))])
  rmSync(directory, {recursive: true, force: true})
}
