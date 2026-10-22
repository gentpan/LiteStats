// Real Node TCP sockets; DNS and connection destinations map exclusively to loopback fixtures.
import assert from "node:assert/strict"
import dns from "node:dns/promises"
import net, { type AddressInfo, type LookupFunction, type NetConnectOpts } from "node:net"
import { syncBuiltinESMExports } from "node:module"
import { mock } from "node:test"
import { inspectCnWhois } from "../../src/lib/site-check-whois"

let mode = "ok", expectedDomain = "example.cn"
const sockets = new Set<net.Socket>()
const response = () => `Domain Name: ${expectedDomain}\r\nExpiration Time: 2030-10-22 18:30:00\r\nReferralServer: whois://127.0.0.1:9999\r\n`
const server = net.createServer(socket => {
  sockets.add(socket)
  socket.on("close", () => sockets.delete(socket))
  socket.on("error", () => {})
  let query = ""
  socket.on("data", chunk => {
    query += chunk.toString("ascii")
    if (!query.endsWith("\r\n")) return
    assert.equal(query, expectedDomain + "\r\n", "Only one exact domain query is sent")
    if (mode === "ok") {
      socket.write(`Domain Name: ${expectedDomain}\r\n`)
      setTimeout(() => socket.end(response().split("\r\n").slice(1).join("\r\n")), 5)
    } else if (mode === "oversize") socket.end(response() + "x".repeat(64 * 1024))
    else if (mode === "truncated") socket.end(`Domain Name: ${expectedDomain}\r\nExpiration Time: 2030-10-22 18:`)
    else if (mode === "reset") {socket.write(response()); setTimeout(() => socket.resetAndDestroy(), 5)}
    else if (mode === "prefix-hang") socket.write(response())
    else if (mode === "limited") socket.end("% Error: Quota exceeded\r\n")
  })
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const port = (server.address() as AddressInfo).port
let answers = [{address: "2606:4700:4700::1111", family: 6}, {address: "1.1.1.1", family: 4}]
let lookups = 0, connections = 0, slowDns = false
const originalConnect = net.createConnection
const mapAddress = (address: string) => address === "1.1.1.1" ? "127.0.0.1" : address === "8.8.8.8" ? "127.0.0.2" : "::1"
function localLookup(lookup: LookupFunction): LookupFunction {
  return (host, options, callback) => {
    assert.equal(options.all, true)
    lookup(host, options, (error, result, family) => {
      if (error) return callback(error, result, family)
      assert.ok(Array.isArray(result))
      assert.deepEqual(result, answers, "Every retry uses the entire validated address snapshot")
      callback(null, result.map(answer => ({...answer, address: mapAddress(answer.address)})))
    })
  }
}
mock.method(dns, "lookup", async (host: string) => {
  lookups++
  assert.equal(host, "whois.cnnic.cn", "Only the fixed registry hostname may be resolved")
  if (slowDns) await new Promise(resolve => setTimeout(resolve, 150))
  return answers
})
mock.method(net, "createConnection", ((options: NetConnectOpts & {lookup: LookupFunction; autoSelectFamily?: boolean}) => {
  connections++
  assert.equal("host" in options && options.host, "whois.cnnic.cn")
  assert.equal("port" in options && options.port, 43)
  assert.equal(options.autoSelectFamily, true)
  return originalConnect({...options, port, lookup: localLookup(options.lookup)})
}) as typeof net.createConnection)
syncBuiltinESMExports()
const signal = () => AbortSignal.timeout(1000)
try {
  for (const candidates of [
    [{address: "2606:4700:4700::1111", family: 6}, {address: "1.1.1.1", family: 4}],
    [{address: "1.1.1.1", family: 4}, {address: "2606:4700:4700::1111", family: 6}],
    [{address: "8.8.8.8", family: 4}, {address: "1.1.1.1", family: 4}],
  ]) {
    answers = candidates
    for (const domain of ["example.cn", "example.com.cn"]) {
      expectedDomain = domain
      assert.deepEqual(await inspectCnWhois(domain, signal()), {expiresAt: "2030-10-22", error: null})
    }
  }
  assert.equal(lookups, 6, "No fallback address or referral causes an unchecked DNS resolution")
  assert.equal(connections, 6, "WHOIS referrals are never followed")
  answers = [{address: "1.1.1.1", family: 4}]
  for (const [current, error] of [["truncated", "格式无效"], ["oversize", "响应内容过大"], ["limited", "查询受限"], ["reset", "无法连接"]]) {
    mode = current
    const result = await inspectCnWhois(expectedDomain, signal())
    assert.equal(result.expiresAt, null)
    assert.ok(result.error?.includes(error), `${mode}: ${result.error}`)
    assert.equal(result.retryable, true)
  }
  mode = "prefix-hang"
  const beforeHang = performance.now()
  const hang = await inspectCnWhois(expectedDomain, AbortSignal.timeout(60))
  assert.equal(hang.expiresAt, null, "A valid-looking prefix is not accepted before EOF")
  assert.ok(hang.error?.includes("超时"))
  assert.ok(performance.now() - beforeHang < 800)
  mode = "ok"
  answers = [{address: "8.8.8.8", family: 4}]
  const unreachable = await inspectCnWhois(expectedDomain, signal())
  assert.equal(unreachable.expiresAt, null)
  assert.equal(unreachable.retryable, true)
  assert.match(unreachable.error || "", /TCP 43|超时/, "Unreachable addresses report a clear connectivity failure or timeout")
  answers = [{address: "1.1.1.1", family: 4}, {address: "127.0.0.1", family: 4}]
  const beforeUnsafe = connections
  const unsafe = await inspectCnWhois(expectedDomain, signal())
  assert.ok(unsafe.error?.includes("公网安全校验"))
  assert.equal(connections, beforeUnsafe, "Mixed public/private addresses fail before opening any socket")
  answers = [{address: "1.1.1.1", family: 4}]
  slowDns = true
  const beforeDns = performance.now(), beforeSlowConnections = connections
  const dnsTimeout = await inspectCnWhois(expectedDomain, AbortSignal.timeout(60))
  assert.ok(dnsTimeout.error?.includes("超时"))
  assert.equal(connections, beforeSlowConnections)
  assert.ok(performance.now() - beforeDns < 800, "DNS uses the same total deadline")
  const beforeBadInput = lookups
  assert.equal((await inspectCnWhois("example.cn\r\nother.cn", signal())).retryable, false)
  assert.equal(lookups, beforeBadInput, "Injected queries are rejected before DNS")
  console.log("PASS: Node CNNIC WHOIS transport, address fallback, fixed endpoint, no referrals, public DNS pinning, size cap, complete EOF, timeout, malformed input and timezone independence")
} finally {
  mock.restoreAll(); syncBuiltinESMExports()
  for (const socket of sockets) socket.destroy()
  await new Promise<void>(resolve => server.close(() => resolve()))
}
