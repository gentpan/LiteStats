import { createFileRoute } from "@tanstack/react-router"
import { findSharedLink } from "~/lib/db"
import { ch } from "~/lib/ch"
import { createStatsHandler } from "~/lib/stats-api"
import { readStatsSnapshot } from "~/lib/stats-api-query"

const statsApi = createStatsHandler({
  authorize:async token => (await findSharedLink(token))?.site || null,
  snapshot:(site,dates) => readStatsSnapshot(ch(),site,dates),
})

export const Route = createFileRoute("/api/v1/stats")({server:{handlers:{GET:({request})=>statsApi(request)}}})
