import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import bcrypt from "bcryptjs"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function toBase32(buf: Buffer) {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function generateTotpSecret() {
  return randomBytes(20)
}

export function totpUri(email: string, secret: Buffer) {
  const label = encodeURIComponent(`LiteStats:${email}`)
  return `otpauth://totp/${label}?secret=${toBase32(secret)}&issuer=LiteStats&period=30&digits=6`
}

export function totpCode(secret: Buffer, unix: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(unix / 30)))
  const hash = createHmac("sha1", secret).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

export function verifyTotp(secret: Buffer, code: string, lastUsedUnix?: number | null) {
  const input = String(code || "").replace(/\s/g, "")
  if (!/^\d{6}$/.test(input)) return null
  const now = Math.floor(Date.now() / 1000)
  for (const time of [now, now - 30]) {
    const window = Math.floor(time / 30) * 30
    if (lastUsedUnix && window <= lastUsedUnix) continue
    const expected = totpCode(secret, time)
    const a = Buffer.from(input)
    const b = Buffer.from(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return window
  }
  return null
}

export function generateRecoveryCodes(count = 10) {
  const codes = new Set<string>()
  while (codes.size < count) {
    codes.add(toBase32(randomBytes(6)).replace(/O/g, "8").replace(/I/g, "7"))
  }
  return [...codes]
}

export async function hashRecoveryCode(code: string) {
  return bcrypt.hash(code, 10)
}

export async function matchRecoveryCode(code: string, digest: string) {
  return bcrypt.compare(code.replace(/\s/g, ""), digest)
}

export function generateTotpToken() {
  return randomBytes(20).toString("base64url")
}
