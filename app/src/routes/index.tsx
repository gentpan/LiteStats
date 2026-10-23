import { createFileRoute, redirect } from "@tanstack/react-router"
import { instanceSetupFn, meFn } from "~/lib/actions"

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): {gsc?: "expired"} => ({gsc: search.gsc === "expired" ? "expired" : undefined}),
  beforeLoad: async ({search}) => {
    if (await meFn()) throw redirect({to: "/dashboard", search: {gsc: search.gsc}, replace: true})
    const { needsSetup } = await instanceSetupFn()
    throw redirect({to: needsSetup ? "/setup" : "/login", replace: true})
  },
})
