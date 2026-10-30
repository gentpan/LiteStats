import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { RouteErrorPage } from "./components/RouteErrorPage"

export function getRouter(){return createRouter({routeTree,defaultErrorComponent:RouteErrorPage,scrollRestoration:true,defaultPreload:"intent",defaultPreloadStaleTime:0})}
