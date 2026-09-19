import { createFileRoute } from "@tanstack/react-router"

import { trackingScript } from "~/lib/tracking-script"

export const Route = createFileRoute("/script.js")({
  server: {
    handlers: {
      GET: async () => new Response(trackingScript, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      }),
    },
  },
})
