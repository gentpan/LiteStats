import { createFileRoute } from "@tanstack/react-router"
import { statsOpenApi } from "~/lib/stats-openapi"
export const Route = createFileRoute("/api/v1/openapi.json")({server:{handlers:{GET:()=>Response.json(statsOpenApi,{headers:{"Cache-Control":"public, max-age=300"}})}}})
