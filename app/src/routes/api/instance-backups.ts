import {createFileRoute} from "@tanstack/react-router"
import {instanceBackupHandler} from "~/lib/instance-backup"

export const Route=createFileRoute("/api/instance-backups")({server:{handlers:{
  GET:({request})=>instanceBackupHandler(request),POST:({request})=>instanceBackupHandler(request),
}}})
