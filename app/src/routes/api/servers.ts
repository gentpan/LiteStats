import { createFileRoute } from "@tanstack/react-router"
import { cfsmServersPayload } from "~/lib/cfsm-api"
import { currentUser } from "~/lib/session"

export const Route = createFileRoute("/api/servers")({
  server: {
    handlers: {
      GET: async () => {
        const user = await currentUser()
        if (!user) return Response.json({ error: "Unauthorized", code: 401 }, { status: 401 })
        return Response.json(await cfsmServersPayload())
      },
    },
  },
})
