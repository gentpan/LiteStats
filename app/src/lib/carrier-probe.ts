import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { platform } from "node:os"
import type { MonitorMetrics } from "./monitor-view"

const run = promisify(execFile)
// Existing representative targets; measurements describe these routes, not an entire carrier.
const targets = { ct: "202.96.128.86", cu: "210.22.84.3", cm: "211.136.17.107" }

export function parsePing(output: string) {
  const loss = output.match(/([\d.]+)%\s+packet loss/)
  const summary = output.match(/(?:round-trip|rtt)[^=]*=\s*[\d.]+\/([\d.]+)\//)
  const lossPct = loss ? Number(loss[1]) : null
  const latency = summary ? Number(summary[1]) : null
  return {
    loss: lossPct != null && lossPct >= 0 && lossPct <= 100 ? lossPct : null,
    latency: latency != null && Number.isFinite(latency) && latency >= 0 ? latency : null,
  }
}

let pending: Promise<MonitorMetrics> | undefined
let cached: MonitorMetrics = {}
let checkedAt = 0

export async function collectCarrierMetrics(): Promise<MonitorMetrics> {
  if (pending) return pending
  if (Date.now() - checkedAt < 60_000) return cached
  pending = (async () => {
    const metrics: MonitorMetrics = {}
    await Promise.all(Object.entries(targets).map(async ([carrier, target]) => {
      const key = `ping_${carrier}`
      metrics[`${key}_target`] = target
      let output = ""
      try {
        const result = await run("ping", ["-n", "-c", "3", "-W", platform() === "darwin" ? "1000" : "1", target], {
          timeout: 6000, maxBuffer: 16384, env: { ...process.env, LC_ALL: "C" },
        })
        output = result.stdout
      } catch (error) {
        output = String((error as { stdout?: string }).stdout || "")
      }
      const result = parsePing(output)
      metrics[key] = result.latency ?? false
      if (result.loss != null) metrics[`${key}_loss`] = result.loss
      metrics[`${key}_status`] = result.loss == null ? "unavailable" : result.loss === 100 ? "timeout" : "ok"
    }))
    checkedAt = Date.now()
    metrics.ping_checked_at = new Date(checkedAt).toISOString()
    cached = metrics
    return metrics
  })()
  try { return await pending } finally { pending = undefined }
}
