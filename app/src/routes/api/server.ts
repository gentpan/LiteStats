import { createFileRoute } from "@tanstack/react-router"
import { cfsmServerDetail } from "~/lib/cfsm-api"
import { currentUser } from "~/lib/session"

export const Route = createFileRoute("/api/server")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser()
        if (!user) return Response.json({ error: "Unauthorized", code: 401 }, { status: 401 })
        const id = new URL(request.url).searchParams.get("id") || ""
        if (!id) return Response.json({ error: "Missing ID", code: 400 }, { status: 400 })
        const server = await cfsmServerDetail(id)
        if (!server) return Response.json({ error: "Server not found", code: 404 }, { status: 404 })
        return Response.json(server)
      },
    },
  },
})
