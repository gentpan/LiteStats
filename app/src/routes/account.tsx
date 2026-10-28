import { MapboxSettingsPanel } from "~/components/MapboxSettingsPanel"
import { mapboxSettingsFn } from "~/lib/mapbox-actions"
import { UIIcon as TabIcon } from "~/components/UIIcon"
import { ActionLink } from "~/components/ActionButton"
import { BackupPanel } from "~/components/BackupPanel"
import { UserManagementPanel } from "~/components/UserManagementPanel"
import { userManagementFn } from "~/lib/user-actions"
import { SettingsLayout, SettingsNav } from "~/components/SettingsLayout"
import { redirect, Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { AccountPreferences } from "~/components/AccountPreferences"
import { AccountSecurity } from "~/components/AccountSecurity"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { useT } from "~/lib/i18n"
import {
  accountSettingsFn,
  backupSettingsFn,
} from "~/lib/actions"

import { ACCOUNT_TABS, SYSTEM_TABS, accountTab } from "~/lib/settings-tabs"

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => ({tab: accountTab(s.tab)}),
  loaderDeps: ({search})=>search,
  loader: async ({deps})=>{
    let data:Awaited<ReturnType<typeof accountSettingsFn>>
    try {data=await accountSettingsFn()} catch {throw redirect({to:"/login"})}
    if(deps.tab.startsWith("system/") && !data.user.isAdmin) throw redirect({to:"/account",search:{tab:"preferences"}})
    const backup=deps.tab === "system/backup" ? await backupSettingsFn() : null
    const mapbox=deps.tab === "system/mapbox" ? await mapboxSettingsFn() : null
    const users=deps.tab === "system/users" ? await userManagementFn() : null
    return {data,backup,mapbox,users}
  },
  component:AccountPage,
})

function AccountPage() {
  const { data, backup, mapbox, users } = Route.useLoaderData()
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
            <ActionLink to="/dashboard" className="btn-secondary settings-back">
              <BackArrow />
              {t("settings.back_sites")}
            </ActionLink>
          )}
        />
        <SettingsLayout navigationTitle={t([...ACCOUNT_TABS,...SYSTEM_TABS].find(item=>item.id===tab)?.label || "设置")} sidebar={<>
          <h3 className="settings-nav-group-title"><TabIcon name="user" />{t("账户")}</h3>
          <SettingsNav label={t("账户设置")}>
            {ACCOUNT_TABS.map(item => <Link key={item.id} to="/account" search={{tab:item.id}} aria-current={tab === item.id ? "page" : undefined} className={`squircle settings-nav-link${tab === item.id ? " is-active" : ""}`}><TabIcon name={item.icon} />{t(item.label)}</Link>)}
          </SettingsNav>
          {user.isAdmin ? <div className="mt-6"><h3 className="settings-nav-group-title"><TabIcon name="grid" />{t("系统设置")}</h3><SettingsNav label={t("系统设置")}>
            {SYSTEM_TABS.map(item=><Link key={item.id} to="/account" search={{tab:item.id}} aria-current={tab === item.id ? "page" : undefined} className={`squircle settings-nav-link${tab === item.id ? " is-active" : ""}`}><TabIcon name={item.icon}/>{t(item.label)}</Link>)}
          </SettingsNav></div> : null}
        </>}>
            {tab === "preferences" ? <AccountPreferences user={user} onSaved={() => router.invalidate()} /> : null}
            {tab === "security" ? <AccountSecurity user={user} passkeys={data.passkeys || []} onSaved={() => router.invalidate()} /> : null}
            {tab === "system/users" && users ? <UserManagementPanel initial={users} /> : null}
            {tab === "system/mapbox" && mapbox ? <MapboxSettingsPanel initial={mapbox} /> : null}
            {tab === "system/backup" && backup ? <BackupPanel initial={backup} /> : null}
        </SettingsLayout>
      </div>
    </Shell>
  )
}
