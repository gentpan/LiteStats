import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("production Node sockets try additional validated addresses without weakening safety checks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litestats-network-run-"))
  try {
    const build = await Bun.build({entrypoints: [new URL("./fixtures/site-check-network-node.ts", import.meta.url).pathname], outdir: directory, target: "node"})
    expect(build.success).toBe(true)
    const child = Bun.spawn(["node", build.outputs[0].path], {stdout: "pipe", stderr: "pipe"})
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({code, stderr}).toEqual({code: 0, stderr: ""})
    expect(stdout).toContain("PASS: Node HTTP/HTTPS/TLS address fallback")
  } finally {await rm(directory, {recursive: true, force: true})}
}, 15_000)
