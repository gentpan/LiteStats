import {rpc} from "~/lib/rpc"
export const mapboxSettingsFn=()=>rpc<{enabled:boolean;configured:boolean}>("/api/mapbox")
export const saveMapboxSettingsFn=async(_input:unknown):Promise<never>=>{throw Error("原版对照页只读，请在 Go 版设置中操作。")}
export const saveMapStyleFn=async(_input:unknown):Promise<never>=>{throw Error("原版对照页只读，请在 Go 版设置中操作。")}
