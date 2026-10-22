import {test, expect} from "bun:test"
import {eventCors} from "../src/lib/event-cors"
import {readJson, eventSchema} from "../src/lib/request-validation"

test("legacy credentialed Beacon preflight returns the exact origin", () => {
  for (const method of ["OPTIONS", "POST"]) {
    const h=eventCors(new Request("https://stats.cleanip.io/api/event", {method, headers:{Origin:"https://cleanip.io"}}))
    expect(h["Access-Control-Allow-Origin"]).toBe("https://cleanip.io")
    expect(h["Access-Control-Allow-Credentials"]).toBe("true")
    expect(h.Vary).toBe("Origin")
    expect(h["Access-Control-Allow-Headers"]).toBe("Content-Type")
  }
})
test("opaque or invalid origins do not receive credentialed access", () => {
  for (const origin of ["null", "https://cleanip.io/path", "bad-origin", ""]) {
    const h=eventCors(new Request("https://stats.example.com/api/event", {headers:{Origin:origin}}))
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined()
  }
})
test("safelisted Beacon body still parses as a validated event", async () => {
  const req=new Request("https://stats.example.com/api/event", {method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({d:"cleanip.io",u:"https://cleanip.io/",n:"pageview"})})
  expect(eventSchema.parse(await readJson(req)).n).toBe("pageview")
})
