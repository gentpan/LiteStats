import { createFileRoute, redirect } from "@tanstack/react-router"
import { instanceSetupFn, meFn } from "~/lib/actions"

/** Old registration URLs follow the instance's one-time setup state. */
export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    if (await meFn()) throw redirect({to: "/dashboard", replace: true})
    const { needsSetup } = await instanceSetupFn()
    throw redirect({to: needsSetup ? "/setup" : "/login", replace: true})
  },
})
