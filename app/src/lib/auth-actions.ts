import { createServerFn } from "@tanstack/react-start"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import QRCode from "qrcode"
import {
  consumeRecoveryCode,
  deletePasskey,
  disableTotp,
  enableTotp,
  findPasskeyByCredentialId,
  getTotpState,
  insertPasskey,
  listPasskeyRecords,
  listPasskeys,
  replaceRecoveryCodes,
  saveTotpSecret,
  bumpTotpLastUsed,
  updatePasskeyCounter,
  verifyPassword,
} from "./db"
import {
  generateRecoveryCodes,
  generateTotpSecret,
  generateTotpToken,
  hashRecoveryCode,
  toBase32,
  totpUri,
  verifyTotp,
} from "./totp"
import { asBuffer, relyingParty } from "./webauthn"
import {
  clear2faPending,
  clearWebauthnChallenge,
  currentUser,
  pending2faUser,
  readLocaleCookie,
  readWebauthnChallenge,
  requireUser,
  writeSession,
  writeWebauthnChallenge,
} from "./session"

export const localeFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentUser()
  if (user?.locale === "en") return "en" as const
  if (user?.locale === "zh-CN") return "zh-CN" as const
  return readLocaleCookie() === "en" ? "en" as const : "zh-CN" as const
})

export const initiate2faFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser()
  const state = await getTotpState(user.id)
  if (state?.totp_enabled) throw new Error("两步验证已经启用")
  const secret = generateTotpSecret()
  await saveTotpSecret(user.id, secret)
  const uri = totpUri(user.email, secret)
  return {
    secret: toBase32(secret),
    uri,
    qr: await QRCode.toDataURL(uri, { width: 180, margin: 1, errorCorrectionLevel: "M" }),
  }
})

export const confirm2faFn = createServerFn({ method: "POST" })
  .validator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const state = await getTotpState(user.id)
    const secret = asBuffer(state?.totp_secret)
    if (!secret) throw new Error("请先开始启用两步验证")
    const window = verifyTotp(secret, data.code)
    if (window == null) throw new Error("验证码不正确")
    await bumpTotpLastUsed(user.id, window)
    await enableTotp(user.id, generateTotpToken())
    const codes = generateRecoveryCodes()
    await replaceRecoveryCodes(user.id, await Promise.all(codes.map((code) => hashRecoveryCode(code))))
    return { codes }
  })

export const disable2faFn = createServerFn({ method: "POST" })
  .validator((d: { password: string, code: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!(await verifyPassword(user.id, data.password))) throw new Error("密码不正确")
    const state = await getTotpState(user.id)
    const secret = asBuffer(state?.totp_secret)
    const totpOk = secret ? verifyTotp(secret, data.code, unix(state?.totp_last_used_at)) != null : false
    const recoveryOk = totpOk ? false : await consumeRecoveryCode(user.id, data.code)
    if (!totpOk && !recoveryOk) throw new Error("验证码不正确")
    await disableTotp(user.id)
    return { ok: true }
  })

export const regenRecoveryFn = createServerFn({ method: "POST" })
  .validator((d: { password: string, code: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!(await verifyPassword(user.id, data.password))) throw new Error("密码不正确")
    const state = await getTotpState(user.id)
    if (!state?.totp_enabled) throw new Error("还没有启用两步验证")
    const secret = asBuffer(state.totp_secret)
    const window = secret ? verifyTotp(secret, data.code, unix(state.totp_last_used_at)) : null
    if (window == null && !(await consumeRecoveryCode(user.id, data.code))) throw new Error("验证码不正确")
    if (window != null) await bumpTotpLastUsed(user.id, window)
    const codes = generateRecoveryCodes()
    await replaceRecoveryCodes(user.id, await Promise.all(codes.map((code) => hashRecoveryCode(code))))
    return { codes }
  })

export const verifyLogin2faFn = createServerFn({ method: "POST" })
  .validator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    const user = await pending2faUser()
    if (!user) throw new Error("验证已过期，请重新登录")
    const state = await getTotpState(user.id)
    const secret = asBuffer(state?.totp_secret)
    const window = secret ? verifyTotp(secret, data.code, unix(state?.totp_last_used_at)) : null
    if (window != null) {
      await bumpTotpLastUsed(user.id, window)
    } else if (!(await consumeRecoveryCode(user.id, data.code))) {
      throw new Error("验证码不正确")
    }
    clear2faPending()
    writeSession(user.id)
    return { ok: true }
  })

export const passkeysFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return listPasskeys(user.id)
})

export const passkeyRegisterOptionsFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser()
  const { rpID } = relyingParty()
  const existing = await listPasskeyRecords(user.id)
  const options = await generateRegistrationOptions({
    rpName: "LiteStats",
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(String(user.id)),
    excludeCredentials: existing.map((row) => ({ id: row.credential_id })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  })
  writeWebauthnChallenge({ type: "reg", challenge: options.challenge, userId: user.id })
  return options
})

export const passkeyRegisterFn = createServerFn({ method: "POST" })
  .validator((d: { name?: string, response: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const pending = readWebauthnChallenge()
    if (!pending || pending.type !== "reg" || pending.userId !== user.id) throw new Error("Passkey 挑战已过期")
    const { rpID, origin } = relyingParty()
    const verification = await verifyRegistrationResponse({
      response: data.response as never,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
    if (!verification.verified || !verification.registrationInfo) throw new Error("无法验证 Passkey")
    const cred = verification.registrationInfo.credential
    await insertPasskey({
      userId: user.id,
      credentialId: cred.id,
      publicKey: Buffer.from(cred.publicKey).toString("base64"),
      counter: cred.counter,
      transports: cred.transports,
      name: data.name?.trim() || `Passkey ${new Date().toLocaleDateString()}`,
    })
    clearWebauthnChallenge()
    return { ok: true }
  })

export const removePasskeyFn = createServerFn({ method: "POST" })
  .validator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await deletePasskey(user.id, data.id)
    return { ok: true }
  })

export const passkeyAuthOptionsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { rpID } = relyingParty()
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  })
  writeWebauthnChallenge({ type: "auth", challenge: options.challenge })
  return options
})

export const passkeyAuthFn = createServerFn({ method: "POST" })
  .validator((d: { response: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const pending = readWebauthnChallenge()
    if (!pending || pending.type !== "auth") throw new Error("Passkey 挑战已过期")
    const credId = String((data.response as { id?: string }).id || "")
    const row = await findPasskeyByCredentialId(credId)
    if (!row) throw new Error("找不到这把 Passkey")
    const { rpID, origin } = relyingParty()
    const verification = await verifyAuthenticationResponse({
      response: data.response as never,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: row.credential_id,
        publicKey: Buffer.from(row.public_key, "base64"),
        counter: Number(row.counter),
      },
      requireUserVerification: false,
    })
    if (!verification.verified) throw new Error("无法验证 Passkey")
    await updatePasskeyCounter(row.id, verification.authenticationInfo.newCounter)
    clearWebauthnChallenge()
    writeSession(row.user_id)
    return { ok: true }
  })

function unix(value: Date | string | null | undefined) {
  if (!value) return null
  const n = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(n) ? Math.floor(n / 1000) : null
}
