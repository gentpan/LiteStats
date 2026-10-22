import { createFileRoute } from "@tanstack/react-router"
import { trackingResponse } from "~/lib/tracking-response"

export const Route = createFileRoute("/js/script.js")({
  server: { handlers: { GET: trackingResponse } },
})
