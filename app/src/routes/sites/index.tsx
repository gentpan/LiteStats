import { createFileRoute, redirect } from "@tanstack/react-router"

/** Preserve the previous site-list entry while keeping one dashboard implementation. */
export const Route = createFileRoute("/sites/")({
  validateSearch: (search: Record<string, unknown>): {gsc?: "expired"} => ({gsc: search.gsc === "expired" ? "expired" : undefined}),
  beforeLoad: ({search}) => {throw redirect({to: "/dashboard", search: {gsc: search.gsc}, replace: true})},
})
