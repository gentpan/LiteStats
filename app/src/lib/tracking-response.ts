import { trackingScript } from "./tracking-script"

export function trackingResponse() {
  return new Response(trackingScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
