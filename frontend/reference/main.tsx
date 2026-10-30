import {useEffect,useState} from "react"
import {createRoot} from "react-dom/client"
import {createRootRoute,createRoute,createRouter,RouterProvider} from "@tanstack/react-router"
import {Shell} from "@original/components/Shell"
import {PageState} from "@original/components/PageState"
import {AnalyticsDashboard} from "./OriginalAnalytics"
import {DashboardPage} from "./OriginalDashboard"
import {SettingsPage} from "./OriginalSiteSettings"
import {AccountPage} from "./OriginalAccount"
import {NewSitePage} from "./OriginalNew"
import {LoginPage} from "./OriginalLogin"
import {SetupPage} from "./OriginalSetup"
import {ActivityPage} from "./OriginalActivity"
import {ApiDocs} from "./OriginalDocs"
import {ReferenceContext} from "./context"
import {I18nProvider} from "~/lib/i18n"
import {MapStyleProvider} from "~/lib/map-preferences"
import {meFn,dashboardFn,siteSettingsFn,sitesFn,activityFn} from "~/lib/actions"
import {rpc} from "~/lib/rpc"
import {parseDashSearch} from "~/lib/range"
import "@original/styles/app.css"
import "./footer.css"

function Reference(){
 const [state,setState]=useState<any>(null)
 const q=new URLSearchParams(location.search)
 const page=q.get("page")||"analytics",domain=q.get("domain")||"example.com"
 const dashSearch=parseDashSearch(Object.fromEntries(q))
 useEffect(()=>{
  async function read(){
   const me=await meFn()
   const prefs=await rpc<{mapboxStyle:string}>("/api/preferences")
   const theme=q.get("theme")||me?.theme
   if(theme&&theme!=="system")document.documentElement.dataset.theme=theme
   let data:any={}
   let search:any={},params={domain}
   if(page.startsWith("site-")){
    data={me,data:await siteSettingsFn({data:{domain}})}
    search={tab:({"site-general":"general","site-visibility":"visibility","site-installation":"installation","site-danger":"danger-zone"}as Record<string,string>)[page]||"general"}
   }else if(["preferences","security","mapbox"].includes(page)){
    data={user:me,mapbox:page==="mapbox"?await rpc("/api/mapbox"):null}
    search={tab:page==="mapbox"?"system/mapbox":page}
   }else if(page==="dashboard")data={me,sites:await sitesFn()}
   else if(page==="new")data={me}
   else if(page==="activity"){
    const window=q.get("window")||"24h"
    data={me,data:await activityFn({data:{domain,window}})};search={window}
   }else if(page==="docs")data=me
   else if(page==="analytics")data={me,data:await dashboardFn({data:{domain,...dashSearch}})}
   setState({me,prefs,data,search,params})
  }
  read().catch(error=>setState({error:String(error)}))
 },[])
 if(!state)return <p>正在加载原版组件…</p>
 if(state.error)return <p role="alert">{state.error}</p>
 const content=page.startsWith("site-")?<SettingsPage/>:["preferences","security","mapbox"].includes(page)?<AccountPage/>:page==="dashboard"?<DashboardPage/>:page==="new"?<NewSitePage/>:page==="login"?<LoginPage/>:page==="setup"?<SetupPage/>:page==="activity"?<ActivityPage/>:page==="docs"?<ApiDocs/>:page==="error"?<PageState title="页面不存在"/>:<Shell user={state.me} layout="analytics"><AnalyticsDashboard data={state.data.data} domain={domain} search={dashSearch} readonly={false} canManage onSearch={()=>{}}/></Shell>
 return <I18nProvider locale={(q.get("locale")||state.me?.locale||"zh-CN")as "zh-CN"|"en"}><MapStyleProvider styleId={state.prefs.mapboxStyle}><ReferenceContext.Provider value={state}>{content}</ReferenceContext.Provider></MapStyleProvider></I18nProvider>
}
const root=createRootRoute({component:Reference})
const route=createRoute({getParentRoute:()=>root,path:"$",component:()=>null})
const router=createRouter({routeTree:root.addChildren([route])})
createRoot(document.getElementById("root")!).render(<RouterProvider router={router}/>)
