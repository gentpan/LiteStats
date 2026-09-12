import { createHmac, timingSafeEqual } from "node:crypto"
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server"
import { SESSION_KEY } from "./env"
import { findUserById, type User } from "./db"

const COOKIE = "litestats_session"

function sign(payload: string) {
  return createHmac("sha256", SESSION_KEY).update(payload).digest("base64url")
}

export function writeSession(userId: number) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 14 * 86400_000 })).toString("base64url")
  setCookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 14 * 86400,
  })
}

export function clearSession() {
  deleteCookie(COOKIE)
}

const PENDING_2FA = "litestats_2fa"
const LOCALE_COOKIE = "litestats_locale"
const WEBAUTHN = "litestats_webauthn"

export function write2faPending(userId: number) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 5 * 60_000 })).toString("base64url")
  setCookie(PENDING_2FA, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 5 * 60,
  })
}

export function clear2faPending() {
  deleteCookie(PENDING_2FA)
}

export async function pending2faUser(): Promise<User | null> {
  const token = getCookie(PENDING_2FA)
  if (!token) return null
  const [payload, mac] = token.split(".")
  if (!payload || !mac) return null
  const expected = sign(payload)
  if (Buffer.from(mac).length !== Buffer.from(expected).length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (!data.uid || data.exp < Date.now()) return null
    return await findUserById(Number(data.uid))
  } catch {
    return null
  }
}

export function writeLocaleCookie(locale: string) {
  setCookie(LOCALE_COOKIE, locale === "en" ? "en" : "zh-CN", {
    path: "/",
    sameSite: "lax",
    maxAge: 365 * 86400,
  })
}

export function readLocaleCookie() {
  return getCookie(LOCALE_COOKIE) || "zh-CN"
}

export function writeWebauthnChallenge(data: { type: "reg" | "auth", challenge: string, userId?: number }) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + 5 * 60_000 })).toString("base64url")
  setCookie(WEBAUTHN, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 5 * 60,
  })
}

export function readWebauthnChallenge(): { type: "reg" | "auth", challenge: string, userId?: number } | null {
  const token = getCookie(WEBAUTHN)
  if (!token) return null
  const [payload, mac] = token.split(".")
  if (!payload || !mac) return null
  const expected = sign(payload)
  if (Buffer.from(mac).length !== Buffer.from(expected).length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (!data.challenge || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

export function clearWebauthnChallenge() {
  deleteCookie(WEBAUTHN)
}

export async function currentUser(): Promise<User | null> {
  const token = getCookie(COOKIE)
  if (!token) return null
  const [payload, mac] = token.split(".")
  if (!payload || !mac) return null
  const expected = sign(payload)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (!data.uid || data.exp < Date.now()) return null
    return await findUserById(Number(data.uid))
  } catch {
    return null
  }
}

export async function requireUser() {
  const user = await currentUser()
  if (!user) throw new Error("UNAUTH")
  return user
}
