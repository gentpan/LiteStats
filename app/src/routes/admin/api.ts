import { createFileRoute } from "@tanstack/react-router"
import { handleCfsmAdmin } from "~/lib/cfsm-api"
import { currentUser } from "~/lib/session"

export const Route = createFileRoute("/admin/api")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await currentUser()
        if (!user) return Response.json({ error: "Unauthorized", code: 401 }, { status: 401 })
        let data: Record<string, unknown> = {}
        try {
          data = await request.json() as Record<string, unknown>
        } catch {
          return Response.json({ error: "invalidJson", code: 400 }, { status: 400 })
        }
        try {
          const result = await handleCfsmAdmin(data)
          if (result && "error" in result && result.error) {
            return Response.json(result, { status: Number(result.code) || 400 })
          }
          return Response.json(result)
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "fail", code: 400 }, { status: 400 })
        }
      },
    },
  },
})
