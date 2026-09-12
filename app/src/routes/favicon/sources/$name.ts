import { createFileRoute } from "@tanstack/react-router"
import domains from "~/lib/referer-domains.json"

const custom: Record<string, string> = {
  Brave: "search.brave.com",
  Kagi: "kagi.com",
  Wikipedia: "en.wikipedia.org",
  Discord: "discord.com",
  Perplexity: "perplexity.ai",
  LinkedIn: "linkedin.com",
  Bluesky: "bsky.app",
  ChatGPT: "chatgpt.com",
  Claude: "claude.ai",
  "X (Twitter)": "x.com",
  Twitter: "twitter.com",
  Google: "google.com",
  Facebook: "facebook.com",
  DuckDuckGo: "duckduckgo.com",
}

const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#71717a"><path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z"/><path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z"/></svg>`

const map = { ...(domains as Record<string, string>), ...custom }

export const Route = createFileRoute("/favicon/sources/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = decodeURIComponent(params.name || "")
        if (!name || name === "placeholder" || /^(direct(\s*\/\s*none)?|\(none\))$/i.test(name)) {
          return new Response(placeholder, {
            headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
          })
        }
        const host = (map[name] || name).split("/")[0].replace(/^www\./, "")
        return Response.redirect(`https://favicon.la/${encodeURIComponent(host)}`, 302)
      },
    },
  },
})
