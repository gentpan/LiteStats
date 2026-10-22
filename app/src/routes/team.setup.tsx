import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/team/setup")({
  beforeLoad: () => { throw redirect({ to: "/account", search: { tab: "preferences" } }) },
})
