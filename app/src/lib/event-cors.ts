// Only the public, write-only event collector supports credentialed legacy Beacons.
// It never reads session cookies or returns account data. Do not reuse for admin APIs.
export function eventCors(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  }
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      const url = new URL(origin)
      if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === origin) {
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
      }
    } catch { /* Invalid and opaque origins get no credentialed access. */ }
  }
  return headers
}
