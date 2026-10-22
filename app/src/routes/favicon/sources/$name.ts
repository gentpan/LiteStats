import { createFileRoute } from "@tanstack/react-router"
import { faviconResponse } from "~/lib/favicon-response"

export const Route = createFileRoute("/favicon/sources/$name")({
  server: {
    handlers: {
      GET: ({ params }) => faviconResponse(params.name || ""),
    },
  },
})
