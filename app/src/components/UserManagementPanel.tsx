import { useState } from "react"
import { ActionButton } from "./ActionButton"
import { Tile } from "./ui"
import { SettingsForm, Field, FormActions } from "./SettingsForm"
import { useT } from "~/lib/i18n"
import { createUserFn, deleteUserFn, resetUserPasswordFn, setRegistrationEnabledFn, setUserDisabledFn, setUserRoleFn, userManagementFn } from "~/lib/user-actions"
type Data = Awaited<ReturnType<typeof userManagementFn>>

export function UserManagementPanel({initial}: {initial: Data}) {
  const {t} = useT()
  const [data, setData] = useState(initial)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [temporaryPassword, setTemporaryPassword] = useState("")
  async function perform(key: string, action: () => Promise<unknown>) {
    setBusy(key); setError(""); setNotice(""); setTemporaryPassword("")
    try {
      await action()
      setData(await userManagementFn())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("操作失败，请稍后重试"))
    } finally { setBusy("") }
  }
  return <>
    <Tile icon="users" title={t("用户管理")} subtitle={t("创建账号、调整角色、停用或删除用户。所有角色变更都会立即使旧会话失效。")}>
      <SettingsForm onSubmit={async event => {
        event.preventDefault()
        await perform("create", async () => {
          await createUserFn({data: {name, email, password}})
          setName(""); setEmail(""); setPassword(""); setNotice(t("用户已创建，并已分配独立站点空间。"))
        })
      }}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("昵称")}><input className="squircle input" value={name} onChange={event => setName(event.target.value)} required /></Field>
          <Field label={t("邮箱")}><input className="squircle input" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></Field>
          <Field label={t("初始密码")}><input className="squircle input" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></Field>
        </div>
        <FormActions><ActionButton className="btn-primary" type="submit" loading={busy === "create"}>{t("创建用户")}</ActionButton></FormActions>
      </SettingsForm>
      <label className="mt-4 flex items-center gap-3 text-sm text-gray-800"><input type="checkbox" checked={data.registrationEnabled} disabled={busy === "registration"} onChange={event => void perform("registration", () => setRegistrationEnabledFn({data: {enabled: event.target.checked}}))} />{t("允许公开注册")}</label>
      {error ? <p role="alert" className="squircle settings-feedback is-error">{error}</p> : null}
      {notice ? <p role="status" className="squircle settings-feedback is-success">{notice}</p> : null}
      {temporaryPassword ? <p role="status" className="squircle settings-feedback is-success">{t("临时密码（仅显示一次）：")}<strong className="ml-2 font-mono select-all">{temporaryPassword}</strong></p> : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500"><th className="py-3 font-medium">{t("用户")}</th><th className="font-medium">{t("角色")}</th><th className="font-medium">{t("状态")}</th><th className="font-medium">{t("创建时间")}</th><th className="font-medium">{t("操作")}</th></tr></thead>
          <tbody>{data.users.map(user => <tr key={user.id} className="border-b border-gray-100 last:border-0">
            <td className="py-3 pr-4"><strong className="block text-gray-900">{user.name}</strong><span className="text-xs text-gray-500">{user.email}</span></td>
            <td className="pr-4"><select className="squircle input h-8 min-h-8 text-xs" value={user.type === "admin" ? "admin" : "standard"} disabled={busy === `role-${user.id}`} onChange={event => void perform(`role-${user.id}`, () => setUserRoleFn({data: {userId: user.id, role: event.target.value as "standard" | "admin"}}))}><option value="standard">{t("普通用户")}</option><option value="admin">{t("实例管理员")}</option></select></td>
            <td className="pr-4"><span className={user.disabled ? "text-red-600" : "text-green-700"}>{t(user.disabled ? "已停用" : "正常")}</span></td>
            <td className="pr-4 text-xs text-gray-500">{new Intl.DateTimeFormat("zh-CN", {year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC"}).format(new Date(user.inserted_at))}</td>
            <td><div className="flex gap-2">
              <ActionButton className="btn-secondary text-xs" disabled={busy === `password-${user.id}`} onClick={() => void perform(`password-${user.id}`, async () => {
                const result = await resetUserPasswordFn({data: {userId: user.id}})
                setTemporaryPassword(result.password)
              })}>{t("重置密码")}</ActionButton>
              <ActionButton className={user.disabled ? "btn-secondary text-xs" : "btn-danger text-xs"} disabled={busy === `disabled-${user.id}`} onClick={() => void perform(`disabled-${user.id}`, () => setUserDisabledFn({data: {userId: user.id, disabled: !user.disabled}}))}>{t(user.disabled ? "启用" : "停用")}</ActionButton>
              <ActionButton className="btn-danger text-xs" disabled={busy === `delete-${user.id}`} onClick={() => {
                if (window.confirm(t("确定删除这个用户吗？其个人站点会保留，但账号无法登录。"))) void perform(`delete-${user.id}`, () => deleteUserFn({data: {userId: user.id}}))
              }}>{t("删除")}</ActionButton>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </Tile>
  </>
}
