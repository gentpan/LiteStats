import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/tracker.js")({
  server: {
    handlers: {
      GET: async () => Response.redirect("/script.js", 302),
    },
  },
})
