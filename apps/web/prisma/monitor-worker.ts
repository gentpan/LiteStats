import { runAllMonitorChecks } from "@/lib/monitor";
import { prisma } from "@/lib/db";
const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_SEC ?? 60) * 1000;

async function pruneOldChecks() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.monitorCheck.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(`Pruned ${result.count} monitor checks older than 30 days`);
  }
}

async function tick() {
  const started = Date.now();
  const results = await runAllMonitorChecks();
  const ok = results.filter((item) => item.ok).length;
  console.log(`[monitor] checked ${results.length} sites (${ok} ok) in ${Date.now() - started}ms`);
}

async function main() {
  console.log(`LiteStats monitor worker started (interval ${INTERVAL_MS / 1000}s)`);

  await tick();

  let pruneCounter = 0;
  setInterval(async () => {
    try {
      await tick();
      pruneCounter += 1;
      if (pruneCounter >= 60) {
        pruneCounter = 0;
        await pruneOldChecks();
      }
    } catch (error) {
      console.error("[monitor] tick error:", error);
    }
  }, INTERVAL_MS);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
