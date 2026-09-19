import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/team")({
  beforeLoad: () => { throw redirect({ to: "/account", search: { tab: "preferences" } }) },
})
