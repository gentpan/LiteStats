import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { startAuthentication } from "@simplewebauthn/browser"
import { useState } from "react"
import { BrandMark } from "~/components/BrandMark"
import { SiteFooter } from "~/components/Shell"
import { loginFn, meFn } from "~/lib/actions"
import { passkeyAuthFn, passkeyAuthOptionsFn, verifyLogin2faFn } from "~/lib/auth-actions"
import { useT } from "~/lib/i18n"

export const Route = createFileRoute("/login")({
  loader: async () => ({ me: await meFn() }),
  component: LoginPage,
})

function LoginPage() {
  const { me } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useT()
  const [email, setEmail] = useState("demo@litestats.dev")
  const [password, setPassword] = useState("12345678")
  const [code, setCode] = useState("")
  const [needs2fa, setNeeds2fa] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  if (me) {
    void router.navigate({ to: "/" })
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-white">
      <div className="flex justify-center pt-12 sm:pt-20">
        <Link to="/login"><BrandMark /></Link>
      </div>
      <div className="mx-auto mt-10 flex max-w-md flex-col gap-y-2 px-4 text-center sm:mt-16">
        <h1 className="text-lg font-semibold sm:text-xl">{needs2fa ? t("login.2fa_title") : t("login.title")}</h1>
        <p className="text-pretty text-base text-gray-500">
          {needs2fa ? t("login.2fa_sub") : "默认管理员 demo@litestats.dev"}
        </p>
      </div>
      {needs2fa ? (
        <form
          className="mx-auto mt-10 flex w-full max-w-md flex-1 flex-col gap-y-6 px-4 pb-16"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError("")
            try {
              await verifyLogin2faFn({ data: { code } })
              await router.navigate({ to: "/" })
            } catch (err) {
              setError(err instanceof Error ? err.message : "验证失败")
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
            {t("security.verify_2fa")}
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </label>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button className="btn btn-primary w-full" disabled={pending} type="submit">
            {pending ? "验证中…" : t("login.2fa_submit")}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => { setNeeds2fa(false); setCode("") }}>{t("login.back")}</button>
        </form>
      ) : (
        <form
          className="mx-auto mt-10 flex w-full max-w-md flex-1 flex-col gap-y-6 px-4 pb-16"
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
              await router.navigate({ to: "/" })
            } catch (err) {
              setError(err instanceof Error ? err.message : "登录失败")
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
            {t("login.email")}
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
            {t("login.password")}
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button className="btn btn-primary w-full" disabled={pending} type="submit">
            {pending ? "登录中…" : t("login.submit")}
          </button>
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={async () => {
              setError("")
              try {
                const options = await passkeyAuthOptionsFn()
                const response = await startAuthentication({ optionsJSON: options })
                await passkeyAuthFn({ data: { response: response as never } })
                await router.navigate({ to: "/" })
              } catch (err) {
                setError(err instanceof Error ? err.message : "Passkey 登录失败")
              }
            }}
          >
            {t("login.passkey")}
          </button>
          <p className="text-center text-sm text-gray-500">
            {t("login.no_account")} <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">{t("login.create")}</Link>
          </p>
        </form>
      )}
      <SiteFooter />
    </div>
  )
}
