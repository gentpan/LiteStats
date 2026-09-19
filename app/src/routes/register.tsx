import { ActionButton } from "~/components/ActionButton"
import { useT } from "~/lib/i18n"
import { redirect, Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { BrandMark } from "~/components/BrandMark"
import { SiteFooter } from "~/components/Shell"
import { meFn, registerFn } from "~/lib/actions"

export const Route = createFileRoute("/register")({
  loader: async () => { if (await meFn()) throw redirect({ to: "/" }); return {} },
  component: RegisterPage,
})

function RegisterPage() {
  const { t } = useT()
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)


  return (
    <div className="auth-page flex w-full flex-col px-4">
      <div className="flex justify-center pt-4 sm:pt-8">
        <Link to="/login"><BrandMark /></Link>
      </div>
      <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-y-2 px-4 text-center">
        <h1 className="auth-heading">{t("创建账号")}</h1>
        <p className="text-pretty text-sm leading-6 text-gray-500">{t("注册后即可添加站点，开始查看访问统计。")}</p>
      </div>
      <form
        data-radius="large" className="ui-surface auth-card mx-auto mt-6 mb-12 flex w-full max-w-md flex-col gap-y-5 p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          setError("")
          try {
            await registerFn({ data: { name, email, password } })
            await router.invalidate()
              await router.navigate({ to: "/" })
          } catch (err) {
            setError(err instanceof Error ? err.message : t("注册失败"))
          } finally {
            setPending(false)
          }
        }}
      >
        <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">{t("名字")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">{t("邮箱")}<input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">{t("密码")}<input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        {error ? <p role="alert" className="text-sm text-red-500">{t(error || "")}</p> : null}
        <ActionButton className="btn btn-primary w-full" icon="lock" disabled={pending} type="submit">
          {pending ? t("创建中…") : t("注册")}
        </ActionButton>
        <p className="text-center text-sm text-gray-500">{t("已有账号？")}<Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">{t("登录")}</Link>
        </p>
      </form>
      <SiteFooter />
    </div>
  )
}
