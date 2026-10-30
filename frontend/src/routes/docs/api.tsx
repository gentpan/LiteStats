import {createFileRoute,redirect} from "@tanstack/react-router"
import {ApiDocsContent} from "~/components/ApiDocs"
import {Shell} from "~/components/Shell"
import {meFn} from "~/lib/actions"

export const Route=createFileRoute("/docs/api")({loader:async()=>{if(await meFn())throw redirect({to:"/account",search:{tab:"api"}});return null},component:Docs})
function Docs(){return <Shell><ApiDocsContent/></Shell>}
