import { createFileRoute, Outlet } from "@tanstack/react-router"

// Child pages have independent loaders and caches; only the index loads analytics.
export const Route = createFileRoute("/sites/$domain")({component: Outlet})
