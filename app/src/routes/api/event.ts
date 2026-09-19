import { createHmac } from "node:crypto"
import { SESSION_KEY } from "~/lib/env"
import { eventSchema, readJson } from "~/lib/request-validation"
import { createFileRoute } from "@tanstack/react-router"
import { findSiteByDomain, eventSession } from "~/lib/db"
import { queueEvent } from "~/lib/ch"
import { extractSearchQuery, parseAcceptLanguage } from "~/lib/languages"
import { parseUa, screenSize } from "~/lib/ua"

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

export const Route = createFileRoute("/api/event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        // Respect Do Not Track (DNT) and Global Privacy Control (GPC)
        const dnt = request.headers.get("dnt")
        const gpc = request.headers.get("sec-gpc")
        if (dnt === "1" || gpc === "1") {
          return new Response("ok", { status: 202, headers: { ...cors(), "Content-Type": "text/plain; charset=utf-8" } })
        }

        let body: Record<string, unknown> = {}
        try {
          body = eventSchema.parse(await readJson(request))
        } catch {
          return new Response("bad request", { status: 400, headers: cors() })
        }
        const domain = String(body.d || body.domain || "")
        const rawUrl = String(body.u || body.url || "")
        let host = ""
        let path = "/"
        let query = ""
        let utm = { source: "", medium: "", campaign: "" }
        try {
          const u = new URL(rawUrl)
          host = u.hostname
          path = u.pathname || "/"
          query = u.search ? u.search.slice(1) : ""
          utm = {
            source: u.searchParams.get("utm_source") || "",
            medium: u.searchParams.get("utm_medium") || "",
            campaign: u.searchParams.get("utm_campaign") || "",
          }
        } catch {
          /* ignore */
        }
        const siteDomain = domain || host.replace(/^www\./, "")
        const site = siteDomain ? await findSiteByDomain(siteDomain) : null
        if (!site) return new Response("ok", { status: 202, headers: cors() })

        const referrer = String(body.r || body.referrer || "")
        let source = "Direct"
        try {
          if (utm.source) source = utm.source
          else if (referrer) source = new URL(referrer).hostname.replace(/^www\./, "") || "Direct"
        } catch {
          /* ignore */
        }
        const ip = (
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-real-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "0"
        )
        const ua = request.headers.get("user-agent") || ""
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: site.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
        const visitorId = createHmac("sha256", SESSION_KEY).update(`${site.id}|${ip}|${ua}|${day}`).digest("hex")
        const sessionId = await eventSession(visitorId)
        const propsRaw = (body.p || body.props || body.m || body.meta || {}) as Record<string, unknown>
        const props: Record<string, string> = {}
        const allowed = site.allowed_event_props
        for (const [k, v] of Object.entries(propsRaw)) {
          const key = String(k).slice(0, 300)
          if (allowed?.length && !allowed.includes(key) && !["url", "path", "search_query", "page_title", "browser_language", "screen_resolution", "url_query"].includes(key)) continue
          if (v != null) props[key] = String(v).slice(0, 2000)
        }
        const parsed = parseUa(ua)
        const width = Number(body.w || body.width || 0)
        const language = String(body.l || body.language || parseAcceptLanguage(request.headers.get("accept-language") || ""))
        const screen = String(body.s || body.screen || "").replace(/\s+/g, "").toLowerCase().replace("x", "x")
        const title = String(body.t || body.title || "")
        const keyword = extractSearchQuery(referrer)

        queueEvent({
          siteId: site.id,
          name: String(body.n || body.name || "pageview"),
          hostname: host || site.domain,
          pathname: path,
          referrer,
          referrerSource: source,
          userId: visitorId,
          sessionId,
          browser: parsed.browser,
          browserVersion: parsed.browserVersion,
          os: parsed.os,
          osVersion: parsed.osVersion,
          device: screenSize(width),
          country: request.headers.get("cf-ipcountry") || request.headers.get("x-country") || "",
          title,
          language,
          screen,
          query,
          keyword,
          utm,
          props,
        })
        return new Response("ok", { status: 202, headers: { ...cors(), "Content-Type": "text/plain; charset=utf-8" } })
      },
    },
  },
})
