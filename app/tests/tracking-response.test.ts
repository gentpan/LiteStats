import { expect, test } from "bun:test"
import { trackingResponse } from "../src/lib/tracking-response"
import { trackingScript } from "../src/lib/tracking-script"

test("all tracker entrypoints can serve cacheable JavaScript without a redirect", async () => {
  const response = trackingResponse()
  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8")
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300")
  expect(await response.text()).toBe(trackingScript)
})
