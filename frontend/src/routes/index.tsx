import {createFileRoute,redirect} from "@tanstack/react-router"
import {meFn,instanceSetupFn} from "~/lib/actions"
export const Route=createFileRoute("/")({loader:async()=>{if((await instanceSetupFn()).needsSetup)throw redirect({to:"/setup"});throw redirect({to:await meFn()?"/dashboard":"/login"})}})
