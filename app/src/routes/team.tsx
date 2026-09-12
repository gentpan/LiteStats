import { createFileRoute, useRouter } from "@tanstack/react-router"
import { meFn } from "~/lib/actions"

export const Route = createFileRoute("/team")({
  loader: async () => ({ me: await meFn() }),
  component: TeamRedirect,
})

function TeamRedirect() {
  const { me } = Route.useLoaderData()
  const router = useRouter()
  if (!me) {
    void router.navigate({ to: "/login" })
    return null
  }
  if (me.team && !me.team.setup_complete) {
    void router.navigate({ to: "/team/setup" })
    return null
  }
  void router.navigate({ to: "/account", search: { tab: "team/general" } })
  return null
}
