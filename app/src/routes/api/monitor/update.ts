import { createFileRoute } from "@tanstack/react-router"
import { ingestMonitor } from "~/lib/monitor"

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

export const Route = createFileRoute("/api/monitor/update")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {}
        try {
          body = await request.json() as Record<string, unknown>
        } catch {
          return Response.json({ error: "Bad request", code: 400 }, { status: 400, headers: cors() })
        }
        const result = await ingestMonitor(body)
        if ("ok" in result) {
          return new Response("OK", { status: 200, headers: { ...cors(), "Content-Type": "text/plain" } })
        }
        if (result.error === "unauthorized") {
          return Response.json({ error: "Invalid secret", code: 401 }, { status: 401, headers: cors() })
        }
        if (result.error === "not_found") {
          return Response.json({ error: "Server not found", code: 404 }, { status: 404, headers: cors() })
        }
        return Response.json({ error: "Bad request", code: 400 }, { status: 400, headers: cors() })
      },
    },
  },
})
