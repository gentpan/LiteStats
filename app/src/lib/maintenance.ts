/** Single application instance: drain requests and workers before a database snapshot/switch. */
// Nitro plugins and Vite SSR chunks may each bundle this module. Share one gate.
const key=Symbol.for("litestats.maintenance.v1")
const shared=globalThis as unknown as Record<symbol,{paused:boolean;requests:number;jobs:number}>
const state=shared[key] ||= {paused:false,requests:0,jobs:0}
export function enterRequest() {
  if (state.paused) return null
  state.requests++
  let released=false
  return ()=>{if(!released){released=true;state.requests--}}
}
export function enterBackgroundJob() {
  if(state.paused)return null
  state.jobs++
  let released=false
  return ()=>{if(!released){released=true;state.jobs--}}
}
export async function withMaintenance<T>(operation:()=>Promise<T>,requestAllowance=1):Promise<T>{
  if(state.paused)throw new Error("正在执行备份或恢复，请稍后重试")
  state.paused=true
  try {
    const deadline=Date.now()+30_000
    while(state.requests>requestAllowance || state.jobs){
      if(Date.now()>deadline)throw new Error("仍有请求正在处理，请稍后重试")
      await new Promise(resolve=>setTimeout(resolve,25))
    }
    return await operation()
  } finally {state.paused=false}
}
