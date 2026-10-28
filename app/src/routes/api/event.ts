import { eventCors } from "~/lib/event-cors"
import { createHmac } from "node:crypto"
import { SESSION_KEY } from "~/lib/env"
import { eventSchema, readJson } from "~/lib/request-validation"
import { createFileRoute } from "@tanstack/react-router"
import { findSiteByDomain, eventSession } from "~/lib/db"
import { queueEvent } from "~/lib/ch"
import { extractSearchQuery, parseAcceptLanguage } from "~/lib/languages"
import { parseUa, screenSize } from "~/lib/ua"
import { dateInTimezone } from "~/lib/date-time"
import { visitorAddress, visitorLocation } from "~/lib/visitor-location"

export const Route = createFileRoute("/api/event")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: eventCors(request) }),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {}
        try {
          body = eventSchema.parse(await readJson(request))
        } catch {
          return new Response("bad request", { status: 400, headers: eventCors(request) })
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
        if (!site) return new Response("ok", { status: 202, headers: eventCors(request) })

        const referrer = String(body.r || body.referrer || "")
        let source = "Direct"
        try {
          if (utm.source) source = utm.source
          else if (referrer) source = new URL(referrer).hostname.replace(/^www\./, "") || "Direct"
        } catch {
          /* ignore */
        }
        const ip = visitorAddress(request.headers)
        const ua = request.headers.get("user-agent") || ""
        const day = dateInTimezone(site.timezone)
        const identity = String(body.v || body.visitor || "") || `${ip}|${ua}|${day}`
        const visitorId = createHmac("sha256", SESSION_KEY).update(`${site.id}|${identity}`).digest("hex")
        const month = new Date().toISOString().slice(0, 7)
        const sessionVisitorId = createHmac("sha256", SESSION_KEY).update(`${site.id}|${ip}|${ua}|${month}`).digest("hex")
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
        const location = await visitorLocation(ip, request.headers.get("cf-ipcountry") || request.headers.get("x-country") || "")

        const accepted = queueEvent({
          siteId: site.id,
          name: String(body.n || body.name || "pageview"),
          hostname: host || site.domain,
          pathname: path,
          referrer,
          referrerSource: source,
          userId: visitorId,
          sessionVisitorId,
          sessionId,
          browser: parsed.browser,
          browserVersion: parsed.browserVersion,
          os: parsed.os,
          osVersion: parsed.osVersion,
          device: screenSize(width),
          ...location,
          title,
          language,
          screen,
          query,
          keyword,
          utm,
          props,
        })
        if (!accepted) {
          return new Response(JSON.stringify({error: "event_buffer_full"}), { status: 503, headers: {
            ...eventCors(request), "Content-Type": "application/json; charset=utf-8", "Retry-After": "1",
          } })
        }
        return new Response("ok", { status: 202, headers: { ...eventCors(request), "Content-Type": "text/plain; charset=utf-8" } })
      },
    },
  },
})
