import { createFileRoute } from "@tanstack/react-router"
import { cfsmConfig } from "~/lib/cfsm-api"
import { currentUser } from "~/lib/session"

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: async () => {
        const user = await currentUser()
        if (!user) return Response.json({ error: "Unauthorized", code: 401 }, { status: 401 })
        return Response.json(await cfsmConfig())
      },
    },
  },
})
