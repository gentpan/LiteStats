import domains from "./referer-domains.json"

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

const sourceDomains: Record<string, string> = { ...domains, ...custom }
const linkPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#71717a"><path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z"/><path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z"/></svg>`
const sitePlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#71717a" stroke-width="1.5"><circle cx="10" cy="10" r="7.5"/><ellipse cx="10" cy="10" rx="3.25" ry="7.5"/><path d="M2.5 10h15"/></svg>`

function placeholderResponse(source: string) {
  return new Response(source, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function publicFaviconHost(value: string): string | null {
  try {
    if (value.length > 2048 || /[\s\\]/.test(value)) return null
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
    const labels = host.split(".")
    if (host.length > 253 || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
    // Do not disclose private, synthetic or reserved hostnames to an external icon service.
    if (/^\d+$/.test(labels.at(-1)!) || /\.(localhost|local|internal|invalid|test|example|lan|onion)$/.test(host)) return null
    if (/(^|\.)(example\.(com|net|org)|home\.arpa)$/.test(host)) return null
    return host
  } catch {
    return null
  }
}

/** The router has already decoded its path parameter; never decode it a second time. */
export function faviconResponse(input: string) {
  const name = input.trim()
  if (!name || name === "placeholder" || /^(direct(\s*\/\s*none)?|\(none\))$/i.test(name)) {
    return placeholderResponse(linkPlaceholder)
  }
  if (name === "site-placeholder") return placeholderResponse(sitePlaceholder)
  const source = Object.hasOwn(sourceDomains, name) ? sourceDomains[name] : name
  const host = publicFaviconHost(source)
  if (!host) return placeholderResponse(sitePlaceholder)
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://favicon.la/${encodeURIComponent(host)}`,
      "Referrer-Policy": "no-referrer",
    },
  })
}
