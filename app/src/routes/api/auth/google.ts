import { createFileRoute } from "@tanstack/react-router"
import { findSiteById, findSiteForUser } from "~/lib/db"
import { exchangeGoogleCode, saveGoogleAuth, verifyGoogleState } from "~/lib/keywords"
import { currentUser } from "~/lib/session"
import { googleOAuthCallback } from "~/lib/google-oauth-flow"

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: ({ request }) => googleOAuthCallback(request, {
        verifyState: verifyGoogleState,
        currentUser,
        findSite: findSiteById,
        canManage: async (userId, domain) => !!await findSiteForUser(userId, domain, "admin"),
        exchange: exchangeGoogleCode,
        save: saveGoogleAuth,
      }),
    },
  },
})
