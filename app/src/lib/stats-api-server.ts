import { findSharedLink } from "./db"
import { ch } from "./ch"
import { createStatsHandler } from "./stats-api"
import { readStatsSnapshot } from "./stats-api-query"

export const statsApi = createStatsHandler({
  authorize:async token => (await findSharedLink(token))?.site || null,
  snapshot:(site,dates) => readStatsSnapshot(ch(),site,dates),
})
