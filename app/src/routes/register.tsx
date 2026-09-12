import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { BrandMark } from "~/components/BrandMark"
import { SiteFooter } from "~/components/Shell"
import { meFn, registerFn } from "~/lib/actions"

export const Route = createFileRoute("/register")({
  loader: async () => ({ me: await meFn() }),
  component: RegisterPage,
})

function RegisterPage() {
  const { me } = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  if (me) {
    void router.navigate({ to: "/" })
    return null
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-white">
      <div className="flex justify-center pt-12 sm:pt-20">
        <Link to="/login"><BrandMark /></Link>
      </div>
      <div className="mx-auto mt-10 flex max-w-md flex-col gap-y-2 px-4 text-center sm:mt-16">
        <h1 className="text-lg font-semibold sm:text-xl">创建账号</h1>
        <p className="text-pretty text-base text-gray-500">如果邮箱已有邀请，注册后会自动加入团队。</p>
      </div>
      <form
        className="mx-auto mt-10 flex w-full max-w-md flex-1 flex-col gap-y-6 px-4 pb-16"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          setError("")
          try {
            await registerFn({ data: { name, email, password } })
            await router.navigate({ to: "/" })
          } catch (err) {
            setError(err instanceof Error ? err.message : "注册失败")
          } finally {
            setPending(false)
          }
        }}
      >
        <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
          名字
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
          邮箱
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-y-2 text-sm font-semibold text-gray-800">
          密码
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <button className="btn btn-primary w-full" disabled={pending} type="submit">
          {pending ? "创建中…" : "注册"}
        </button>
        <p className="text-center text-sm text-gray-500">
          已有账号？ <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">登录</Link>
        </p>
      </form>
      <SiteFooter />
    </div>
  )
}
