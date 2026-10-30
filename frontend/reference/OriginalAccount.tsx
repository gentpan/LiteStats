import {Link} from "@tanstack/react-router"
import {ActionLink} from "@original/components/ActionButton"
import {SettingsHeader} from "@original/components/SettingsChrome"
import {SettingsLayout,SettingsNav} from "@original/components/SettingsLayout"
import {Shell} from "@original/components/Shell"
import {UIIcon as TabIcon} from "@original/components/UIIcon"
import {AccountPreferences} from "@original/components/AccountPreferences"
import {MapboxSettingsPanel} from "@original/components/MapboxSettingsPanel"
import {AccountSecurity} from "./OriginalSecurity"
import {ApiDocs} from "./OriginalDocs"
import {Route} from "./context"
import {useT} from "~/lib/i18n"

const ACCOUNT_TABS=[{id:"preferences",label:"偏好设置"},{id:"security",label:"安全"},{id:"api",label:"API"}]
const SYSTEM_TABS=[{id:"system/mapbox",label:"访客地图"},{id:"system/backup",label:"备份与恢复"}]
// Original account route display DOM; teams, Passkey and API keys are excluded.
// API documentation is explicitly moved into the settings sidebar in this edition.
export function AccountPage(){
 const {user,mapbox}=Route.useLoaderData()
 const {tab}=Route.useSearch()
 const {t}=useT()
 return <Shell user={user}>
  <div>
   <SettingsHeader title={t("settings.title")} back={<ActionLink to="/dashboard" className="btn-secondary settings-back">{t("settings.back_sites")}</ActionLink>}/>
   <SettingsLayout navigationTitle={t([...ACCOUNT_TABS,...SYSTEM_TABS].find(item=>item.id===tab)?.label||"设置")} sidebar={<>
    <h3 className="settings-nav-group-title"><TabIcon name="user"/>{t("账户")}</h3>
    <SettingsNav label={t("账户设置")}>{ACCOUNT_TABS.map(item=><Link key={item.id} to="/account" search={{tab:item.id}} aria-current={tab===item.id?"page":undefined} className={`squircle settings-nav-link${tab===item.id?" is-active":""}`}>{t(item.label)}</Link>)}</SettingsNav>
    {user.isAdmin?<div className="mt-6"><h3 className="settings-nav-group-title"><TabIcon name="grid"/>{t("系统设置")}</h3><SettingsNav label={t("系统设置")}>{SYSTEM_TABS.map(item=><Link key={item.id} to="/account" search={{tab:item.id}} aria-current={tab===item.id?"page":undefined} className={`squircle settings-nav-link${tab===item.id?" is-active":""}`}>{t(item.label)}</Link>)}</SettingsNav></div>:null}
   </>}>
    {tab==="preferences"?<AccountPreferences user={user} onSaved={()=>{}}/>:null}
    {tab==="security"?<AccountSecurity user={user} passkeys={[]} onSaved={()=>{}}/>:null}
    {tab==="system/mapbox"&&mapbox?<MapboxSettingsPanel initial={mapbox}/>:null}
   </SettingsLayout>
  </div>
 </Shell>
}
