import {createFileRoute,redirect} from "@tanstack/react-router"
export const Route=createFileRoute("/backup")({loader:()=>{throw redirect({to:"/account",search:{tab:"system/backup"}})}})
