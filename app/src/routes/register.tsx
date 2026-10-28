import { useState } from "react"
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router"
import { ActionButton } from "~/components/ActionButton"
import { BrandMark } from "~/components/BrandMark"
import { SiteFooter } from "~/components/Shell"
import { instanceSetupFn, meFn } from "~/lib/actions"
import { registerFn, registrationStatusFn } from "~/lib/user-actions"
import { useT } from "~/lib/i18n"

export const Route = createFileRoute("/register")({
  loader: async () => {
    if (await meFn()) throw redirect({to: "/dashboard", replace: true})
    if ((await instanceSetupFn()).needsSetup) throw redirect({to: "/setup", replace: true})
    return registrationStatusFn()
  },
  component: RegisterPage,
})

function RegisterPage() {
  const {enabled} = Route.useLoaderData()
  const router = useRouter()
  const {t} = useT()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  return <div className="auth-page">
    <main className="auth-main">
      <section className="auth-panel">
        <div className="auth-brand"><Link to="/"><BrandMark /></Link></div>
        <header className="text-center"><h1 className="auth-heading">{t("创建账号")}</h1><p className="mt-2 text-sm text-gray-500">{t("注册后即可添加并管理自己的站点。")}</p></header>
        {enabled ? <form data-radius="large" className="squircle ui-surface auth-card flex w-full flex-col gap-y-5 p-6" onSubmit={async event => {
          event.preventDefault()
          setPending(true); setError("")
          try {
            await registerFn({data: {name, email, password}})
            await router.invalidate()
            await router.navigate({to: "/dashboard"})
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : t("注册失败，请稍后重试"))
          } finally { setPending(false) }
        }}>
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">{t("昵称")}<input className="squircle input" autoComplete="name" maxLength={255} value={name} onChange={event => setName(event.target.value)} required /></label>
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">{t("邮箱")}<input className="squircle input" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">{t("密码")}<input className="squircle input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /><span className="text-xs font-normal text-gray-500">{t("至少 8 位，请使用独立密码。")}</span></label>
          {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
          <ActionButton className="btn btn-primary w-full" loading={pending} type="submit">{t(pending ? "正在创建账号…" : "创建账号")}</ActionButton>
        </form> : <div data-radius="large" className="squircle ui-surface auth-card p-6 text-center"><p className="text-sm text-gray-600">{t("当前未开放注册，请联系实例管理员创建账号。")}</p></div>}
        <p className="mt-5 text-center text-sm text-gray-500">{t("已有账号？")} <Link to="/login" className="font-medium text-green-700">{t("直接登录")}</Link></p>
      </section>
    </main>
    <SiteFooter showBrand={false} />
  </div>
}
