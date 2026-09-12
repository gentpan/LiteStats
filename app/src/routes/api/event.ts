import { createFileRoute } from "@tanstack/react-router"
import { findSiteByDomain } from "~/lib/db"
import { insertEvent } from "~/lib/ch"
import { extractSearchQuery, parseAcceptLanguage } from "~/lib/languages"
import { parseUa, screenSize } from "~/lib/ua"

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

function hash64(s: string) {
  let h = 14695981039346656037n
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * 1099511628211n) & 0xffffffffffffffffn
  }
  return h.toString()
}

export const Route = createFileRoute("/api/event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {}
        try {
          body = await request.json() as Record<string, unknown>
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
        const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0] || "0"
        const ua = request.headers.get("user-agent") || ""
        const day = new Date().toISOString().slice(0, 10)
        const hour = new Date().toISOString().slice(0, 13)
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

        await insertEvent({
          siteId: site.id,
          name: String(body.n || body.name || "pageview"),
          hostname: host || site.domain,
          pathname: path,
          referrer,
          referrerSource: source,
          userId: hash64(`${site.id}|${ip}|${ua}|${day}`),
          sessionId: hash64(`${site.id}|${ip}|${ua}|${hour}`),
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
