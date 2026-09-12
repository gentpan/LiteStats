import { createFileRoute } from "@tanstack/react-router"
import { cfsmHistory } from "~/lib/cfsm-api"
import { currentUser } from "~/lib/session"

const ALLOWED = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168]

export const Route = createFileRoute("/api/history/all")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser()
        if (!user) return Response.json({ error: "Unauthorized", code: 401 }, { status: 401 })
        const url = new URL(request.url)
        const id = url.searchParams.get("id") || ""
        const hours = parseFloat(url.searchParams.get("hours") || "24")
        if (!id) return Response.json({ error: "Missing ID", code: 400 }, { status: 400 })
        const span = ALLOWED.includes(hours) ? hours : Math.min(Math.max(hours || 24, 0.167), 168)
        const rows = await cfsmHistory(id, span)
        if (!rows) return Response.json({ error: "Server not found", code: 404 }, { status: 404 })
        return Response.json(rows)
      },
    },
  },
})
