import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { DATABASE_URL } from "../src/lib/env"
import { db } from "../src/lib/db"
import { createMonitorServer, deleteMonitorServer, getMonitorServer, getMonitorHistory } from "../src/lib/monitor"

assert.equal(new URL(DATABASE_URL).host, "127.0.0.1:55435", "Use isolated test database")
const temp = await mkdtemp(join(tmpdir(), "litestats-carrier-"))
const server = await createMonitorServer("Carrier integration fixture")
try {
  await writeFile(join(temp,"ping"), '#!/bin/sh\nprintf "3 packets transmitted, 2 packets received, 33.3%% packet loss\\nround-trip min/avg/max/stddev = 8/12.5/17/4.5 ms\\n"\nexit 1\n', {mode:0o700})
  await promisify(execFile)("sh", [resolve("../agent/litestats-agent.sh"), "--once", "--ping"], {
    timeout:30000,
    env:{...process.env,PATH:`${temp}:${process.env.PATH}`,LITESTATS_URL:"http://127.0.0.1:3100",LITESTATS_ID:server.id,LITESTATS_SECRET:server.secret,LITESTATS_STATE:join(temp,"state")},
  })
  const stored = await getMonitorServer(server.id)
  const history = await getMonitorHistory(server.id,1)
  for (const carrier of ["ct","cu","cm"] as const) {
    assert.equal(stored?.latest_metrics?.[`ping_${carrier}`],12.5)
    assert.equal(stored?.latest_metrics?.[`ping_${carrier}_loss`],33.3)
    assert.equal(history[0][`ping_${carrier}`],12.5)
    assert.equal(history[0][`ping_${carrier}_loss`],33.3)
  }
  console.log("PASS: shell probe → authenticated HTTP ingestion → stored metrics → latency/loss history (controlled fixture)")
} finally {
  await deleteMonitorServer(server.id)
  await rm(temp,{recursive:true,force:true})
  await (await db()).end()
}
