import { createFileRoute } from "@tanstack/react-router"
import { findSiteById } from "~/lib/db"
import { exchangeGoogleCode, saveGoogleAuth, verifyGoogleState } from "~/lib/keywords"
import { currentUser } from "~/lib/session"

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get("code") || ""
        const state = url.searchParams.get("state") || ""
        const siteId = verifyGoogleState(state)
        const user = await currentUser()
        const site = siteId ? await findSiteById(siteId) : null
        if (!user || !site || !code) {
          return Response.redirect(new URL("/login", url.origin), 302)
        }
        const token = await exchangeGoogleCode(code)
        await saveGoogleAuth(site.id, user.id, token)
        return Response.redirect(new URL(`/sites/${encodeURIComponent(site.domain)}/settings?tab=integrations`, url.origin), 302)
      },
    },
  },
})
