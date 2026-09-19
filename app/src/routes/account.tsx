import { ApiUsageDocs } from "~/components/ApiUsageDocs"
import { SettingsNav } from "~/components/SettingsNav"
import { ServiceDirectory } from "~/components/ServiceDirectory"
import { ActionButton } from "~/components/ActionButton"
import { UIIcon as TabIcon } from "~/components/UIIcon"
import { ChannelSettingsPanel } from "~/components/ChannelSettingsPanel"
import { BackupPanel } from "~/components/BackupPanel"
import { SettingsLayout } from "~/components/SettingsLayout"
import { Field, FormActions, SettingsForm } from "~/components/SettingsForm"
import { redirect, Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { AccountPreferences } from "~/components/AccountPreferences"
import { AccountSecurity } from "~/components/AccountSecurity"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { Tile } from "~/components/ui"
import { useT } from "~/lib/i18n"
import {
  accountSettingsFn,
  backupSettingsFn,
  systemSettingsFn,
  createApiKeyFn,
  removeApiKeyFn,
} from "~/lib/actions"

const ACCOUNT_TABS = [
  { id: "preferences", label: "偏好设置", icon: "cog" },
  { id: "security", label: "安全", icon: "lock" },
  { id: "api-keys", label: "API 密钥", icon: "key" },
]

const SYSTEM_TABS = [
  { id: "system/services", label: "服务与 API 配置", icon: "grid" },
  { id: "system/email", label: "邮件服务", icon: "mail" },
  { id: "system/telegram", label: "Telegram", icon: "cog" },
  { id: "system/backup", label: "备份与恢复", icon: "cloud" },
]

export const Route = createFileRoute("/account")({
  validateSearch: (s:Record<string,unknown>)=>({tab:s.tab === "backup" ? "system/backup" : [...ACCOUNT_TABS,...SYSTEM_TABS].some(item=>item.id === s.tab) ? String(s.tab) : "preferences"}),
  loaderDeps: ({search})=>search,
  loader: async ({deps})=>{
    let data:Awaited<ReturnType<typeof accountSettingsFn>>
    try {data=await accountSettingsFn()} catch {throw redirect({to:"/login"})}
    if(deps.tab.startsWith("system/") && !data.user.isAdmin) throw redirect({to:"/account",search:{tab:"preferences"}})
    const backup=deps.tab === "system/backup" ? await backupSettingsFn() : null
    const channels=deps.tab === "system/email" || deps.tab === "system/telegram" ? await systemSettingsFn() : null
    return {data,backup,channels}
  },
  component:AccountPage,
})

function AccountPage() {
  const { data, backup, channels } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const router = useRouter()
  const { t } = useT()
  const user = data.user
  return (
    <Shell user={user}>
      <div>
        <SettingsHeader
          title={t("settings.title")}
          back={(
            <Link to="/" className="btn btn-secondary btn-sm settings-back">
              <BackArrow />
              {t("settings.back_sites")}
            </Link>
          )}
        />
        <SettingsLayout navigationTitle={t([...ACCOUNT_TABS,...SYSTEM_TABS].find(item=>item.id===tab)?.label || "设置")} sidebar={<>
          <h3 className="settings-nav-group-title"><TabIcon name="user" />{t("账户")}</h3>
          <SettingsNav label={t("账户设置")}>
            {ACCOUNT_TABS.map(item => <Link key={item.id} to="/account" search={{tab:item.id}} aria-current={tab === item.id ? "page" : undefined} className={`settings-nav-link${tab === item.id ? " is-active" : ""}`}><TabIcon name={item.icon} />{t(item.label)}</Link>)}
          </SettingsNav>
          {user.isAdmin ? <div className="mt-6"><h3 className="settings-nav-group-title"><TabIcon name="grid" />{t("系统设置")}</h3><SettingsNav label={t("系统设置")}>
            {SYSTEM_TABS.map(item=><Link key={item.id} to="/account" search={{tab:item.id}} aria-current={tab === item.id ? "page" : undefined} className={`settings-nav-link${tab === item.id ? " is-active" : ""}`}><TabIcon name={item.id === "system/telegram" ? "telegram" : item.icon}/>{t(item.label)}</Link>)}
          </SettingsNav></div> : null}
        </>}>
            {tab === "preferences" ? <AccountPreferences user={user} onSaved={() => router.invalidate()} /> : null}
            {tab === "security" ? <AccountSecurity user={user} passkeys={data.passkeys || []} onSaved={() => router.invalidate()} /> : null}
            {tab === "api-keys" ? <ApiKeys keys={data.keys} onSaved={() => router.invalidate()} /> : null}
            {tab === "system/backup" && backup ? <BackupPanel initial={backup} /> : null}
            {(tab === "system/email" || tab === "system/telegram") && channels ? <ChannelSettingsPanel key={tab} channel={tab === "system/email" ? "smtp" : "telegram"} initial={channels} /> : null}
            {tab === "system/services" ? <ServiceDirectory sites={data.sites} /> : null}
        </SettingsLayout>
      </div>
    </Shell>
  )
}

function ApiKeys({ keys, onSaved }: { keys: Array<{ id: number, name: string, key_prefix: string, scopes: string[] }>, onSaved: () => void }) {
  const { t } = useT()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState("stats_api")
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState("")
  if (creating) {
    return (
      <Tile icon="plus" title={t("新建 API 密钥")}>
        <SettingsForm
          className="settings-form gap-5"
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            try {
              const row = await createApiKeyFn({ data: { name, type } })
              setCreated(row.key)
              setCreating(false)
              onSaved()
            } catch (err) {
              setError(err instanceof Error ? err.message : t("无法创建"))
            }
          }}
        >
          <Field label={t("名称")}><input className="input" placeholder="Development" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <fieldset className="settings-provider-options">
            <legend className="settings-label">{t("类型")}</legend>
            <label className="settings-provider-option">
              <input type="radio" name="api-key-scope" checked={type === "stats_api"} onChange={() => setType("stats_api")} />
              <span>
                <span className="font-medium">{t("统计 API")}</span>
                <span className="block text-gray-500">{t("统计读取权限标记（接口待接入）")}</span>
              </span>
            </label>
            <label className="settings-provider-option">
              <input type="radio" name="api-key-scope" checked={type === "sites_api"} onChange={() => setType("sites_api")} />
              <span>
                <span className="font-medium">{t("站点 API")}</span>
                <span className="block text-gray-500">{t("统计与站点权限标记（接口待接入）")}</span>
              </span>
            </label>
          </fieldset>
          {error ? <p className="text-sm text-red-500">{t(error || "")}</p> : null}
          <FormActions><ActionButton icon="plus" className="btn btn-primary" type="submit">{t("创建 API 密钥")}</ActionButton>
          <ActionButton type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>{t("取消")}</ActionButton></FormActions>
        </SettingsForm>
      </Tile>
    )
  }
  return (
    <Tile icon="key" title={t("API 密钥")} subtitle={t("管理个人 API 访问凭据，并在下方查看详细使用文档与接口规范。")}>
      {created ? (
        <div className="mb-4 rounded-md bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-900">{t("请立即保存密钥，之后无法再查看。")}</p>
          <input aria-label={t("密钥")} className="input mt-2 font-mono" readOnly value={created} />
        </div>
      ) : null}
      {keys.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center justify-center pt-5 pb-6">
          <span className="settings-card-icon mb-3"><TabIcon name="key" /></span><h3 className="text-center text-base font-medium text-gray-900">{t("创建第一个 API 密钥")}</h3>
          <p className="mt-1 text-center text-sm leading-5 text-pretty text-gray-500">{t("可创建和撤销密钥；下方可查看详细接口与埋点使用文档。")}</p>
          <ActionButton icon="plus" type="button" className="btn btn-primary mt-4" onClick={() => setCreating(true)}>{t("新建 API 密钥")}</ActionButton>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <ActionButton icon="plus" type="button" className="btn btn-primary" onClick={() => setCreating(true)}>{t("新建 API 密钥")}</ActionButton>
            <a href="#api-docs" className="text-xs text-purple-600 hover:text-purple-700 hover:underline flex items-center gap-1 font-medium">
              <TabIcon name="code" />
              <span>{t("查看使用文档 ↓")}</span>
            </a>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="py-2 font-medium">{t("姓名")}</th>
                <th className="py-2 font-medium">{t("密钥")}</th>
                <th className="py-2 font-medium">{t("类型")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-gray-200">
                  <td className="py-3">{key.name}</td>
                  <td className="py-3 font-mono">{key.key_prefix}{"*".repeat(26)}</td>
                  <td className="py-3">{key.scopes.includes("sites:provision:*") ? t("站点 API") : t("统计 API")}</td>
                  <td className="py-3 text-right">
                    <ActionButton
                      type="button"
                      className="text-red-600 hover:text-red-700"
                      onClick={async () => {
                        if (!confirm(t("确定要撤销这把密钥吗？此操作无法撤销。"))) return
                        await removeApiKeyFn({ data: { id: key.id } })
                        onSaved()
                      }}
                    >{t("撤销")}</ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      <ApiUsageDocs />
    </Tile>
  )
}
