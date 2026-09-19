import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    unmaskOnReload: false,
    routeMasks: [
      {routeTree,from:"/account",to:"/account",search:{}} ,
      {routeTree,from:"/sites/$domain",to:"/sites/$domain",params:(params:Record<string,string>)=>params,search:{}} ,
      {routeTree,from:"/sites/$domain/settings",to:"/sites/$domain/settings",params:(params:Record<string,string>)=>params,search:{}} ,
      {routeTree,from:"/sites/$domain/activity",to:"/sites/$domain/activity",params:(params:Record<string,string>)=>params,search:{}} ,
      {routeTree,from:"/share/$slug",to:"/share/$slug",params:(params:Record<string,string>)=>params,search:{}} ,
    ],
  })
}
