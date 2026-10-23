import { createFileRoute } from "@tanstack/react-router"
import { statsApi } from "~/lib/stats-api-server"

export const Route = createFileRoute("/api/v1/stats")({server:{handlers:{GET:({request})=>statsApi(request)}}})
