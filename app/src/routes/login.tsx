import { ActionButton } from "~/components/ActionButton"
import { redirect, Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { startAuthentication } from "@simplewebauthn/browser"
import { useState } from "react"
import { BrandMark } from "~/components/BrandMark"
import { SiteFooter } from "~/components/Shell"
import { loginFn, meFn } from "~/lib/actions"
import { passkeyAuthFn, passkeyAuthOptionsFn, verifyLogin2faFn } from "~/lib/auth-actions"
import { useT } from "~/lib/i18n"

export const Route = createFileRoute("/login")({
  loader: async () => { if (await meFn()) throw redirect({ to: "/" }); return {} },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { t } = useT()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [needs2fa, setNeeds2fa] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)


  return (
    <div className="auth-page flex w-full flex-col px-4">
      <div className="flex justify-center pt-4 sm:pt-8">
        <Link to="/login"><BrandMark /></Link>
      </div>
      <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-y-2 px-4 text-center">
        <h1 className="auth-heading">{needs2fa ? t("login.2fa_title") : t("login.title")}</h1>
        <p className="text-pretty text-sm leading-6 text-gray-500">
          {needs2fa ? t("login.2fa_sub") : t("使用你的邮箱和密码登录")}
        </p>
      </div>
      {needs2fa ? (
        <form
          data-radius="large" className="ui-surface auth-card mx-auto mt-6 mb-12 flex w-full max-w-md flex-col gap-y-5 p-6"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError("")
            try {
              await verifyLogin2faFn({ data: { code } })
              await router.invalidate()
              await router.navigate({ to: "/" })
            } catch (err) {
              setError(err instanceof Error ? err.message : t("验证失败"))
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
            {t("security.verify_2fa")}
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </label>
          {error ? <p role="alert" className="text-sm text-red-500">{t(error || "")}</p> : null}
          <ActionButton className="btn btn-primary w-full" icon="lock" disabled={pending} type="submit">
            {pending ? t("验证中…") : t("login.2fa_submit")}
          </ActionButton>
          <ActionButton type="button" className="btn btn-ghost w-full" onClick={() => { setNeeds2fa(false); setCode("") }}>{t("login.back")}</ActionButton>
        </form>
      ) : (
        <form
          data-radius="large" className="ui-surface auth-card mx-auto mt-6 mb-12 flex w-full max-w-md flex-col gap-y-5 p-6"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError("")
            try {
              const result = await loginFn({ data: { email, password } })
              if ("needs2fa" in result && result.needs2fa) {
                setNeeds2fa(true)
                return
              }
              await router.invalidate()
              await router.navigate({ to: "/" })
            } catch (err) {
              setError(err instanceof Error ? err.message : t("登录失败"))
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
            {t("login.email")}
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
            {t("login.password")}
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p role="alert" className="text-sm text-red-500">{t(error || "")}</p> : null}
          <ActionButton className="btn btn-primary w-full" icon="lock" disabled={pending} type="submit">
            {pending ? t("登录中…") : t("login.submit")}
          </ActionButton>
          <ActionButton
            type="button"
            icon="key" className="btn btn-secondary w-full"
            onClick={async () => {
              setError("")
              try {
                const options = await passkeyAuthOptionsFn()
                const response = await startAuthentication({ optionsJSON: options })
                await passkeyAuthFn({ data: { response: response as never } })
                await router.invalidate()
              await router.navigate({ to: "/" })
              } catch (err) {
                setError(err instanceof Error ? err.message : t("Passkey 登录失败"))
              }
            }}
          >
            {t("login.passkey")}
          </ActionButton>
          <p className="text-center text-sm text-gray-500">
            {t("login.no_account")} <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">{t("login.create")}</Link>
          </p>
        </form>
      )}
      <SiteFooter />
    </div>
  )
}
