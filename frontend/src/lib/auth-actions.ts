import {rpc} from "./rpc"
import {meFn} from "./actions"
import {normalizeMapboxStyle} from "./mapbox-styles"
import QRCode from "qrcode"
export async function rootPreferencesFn(){const [user,prefs]=await Promise.all([meFn(),rpc<{mapboxStyle:string}>("/api/preferences")]);return {locale:user?.locale||((localStorage.getItem("plost:locale")==="en")?"en":"zh-CN"),theme:user?.theme||"system",mapboxStyle:normalizeMapboxStyle(prefs.mapboxStyle)}}
export const verifyLogin2faFn=({data}:{data:{code:string}})=>rpc("/api/login/totp","POST",data)
export async function initiate2faFn({data}:{data:{password:string}}){const r=await rpc<{secret:string;uri:string}>("/api/account/totp","POST",{action:"begin",...data});return {secret:r.secret,qr:await QRCode.toDataURL(r.uri)}}
export async function confirm2faFn({data}:{data:{code:string;password:string}}){const r=await rpc<{recoveryCodes:string[]}>("/api/account/totp","POST",{action:"enable",...data});return {codes:r.recoveryCodes}}
export const disable2faFn=({data}:{data:{code:string;password:string}})=>rpc("/api/account/totp","POST",{action:"disable",...data})
export async function regenRecoveryFn({data}:{data:{code:string;password:string}}){const r=await rpc<{recoveryCodes:string[]}>("/api/account/totp","POST",{action:"recovery",...data});return {codes:r.recoveryCodes}}
