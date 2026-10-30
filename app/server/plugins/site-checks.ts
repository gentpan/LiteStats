import { definePlugin } from "nitro"
import {enterBackgroundJob} from "../../src/lib/maintenance"
import { runDueSiteChecks } from "../../src/lib/site-checks"

export default definePlugin(app => {
  // Development/builds never start probes. Disposable tests may explicitly disable the worker.
  if (process.env.NODE_ENV !== "production" || process.env.LITESTATS_HEALTH_WORKER === "false") return
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  let running: Promise<void> | null = null
  const tick = () => {
    if (stopped) return
    const release=enterBackgroundJob()
    if(!release){timer=setTimeout(tick,30_000);timer.unref();return}
    running = runDueSiteChecks().catch(() => console.error("[Plost] Site check scheduler unavailable"))
      .finally(() => { release(); if (!stopped) {timer = setTimeout(tick, 30_000); timer.unref()} })
  }
  timer = setTimeout(tick, 5_000)
  timer.unref()
  app.hooks.hook("close", async () => {stopped = true; clearTimeout(timer); await running})
})
