import { getRequestUrl } from "@tanstack/react-start/server"

export function relyingParty() {
  const url = getRequestUrl()
  return { rpID: url.hostname, origin: url.origin }
}

export function asBuffer(value: Buffer | Uint8Array | string | null | undefined) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return Buffer.from(value)
}
