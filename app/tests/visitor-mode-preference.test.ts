import { expect, test } from "bun:test"
import { readVisitorMode, saveVisitorMode } from "../src/lib/visitor-mode-preference"

test("visitor metric preference defaults to persistent visitors and restores sessions", () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  } as Storage
  expect(readVisitorMode(storage)).toBe("persistent")
  saveVisitorMode("sessions", storage)
  expect(readVisitorMode(storage)).toBe("sessions")
  saveVisitorMode("persistent", storage)
  expect(readVisitorMode(storage)).toBe("persistent")
})

test("visitor metric preference tolerates blocked storage and invalid values", () => {
  const blocked = {getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") }} as unknown as Storage
  expect(readVisitorMode(blocked)).toBe("persistent")
  expect(() => saveVisitorMode("sessions", blocked)).not.toThrow()
  expect(readVisitorMode({getItem: () => "invalid"} as unknown as Storage)).toBe("persistent")
})
