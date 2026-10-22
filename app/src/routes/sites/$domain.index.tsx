import { useEffect } from "react"
import { Navigate, createFileRoute, redirect, useRouter, type SearchSchemaInput } from "@tanstack/react-router"
import { AnalyticsDashboard } from "~/components/AnalyticsDashboard"
import { PageState } from "~/components/PageState"
import { Shell } from "~/components/Shell"
import { dashboardFn, meFn } from "~/lib/actions"
import { compactDashSearch, dashInput, parseDashSearch, type DashSearch } from "~/lib/range"

export const Route = createFileRoute("/sites/$domain/")({
  validateSearch: (search: Partial<DashSearch> & SearchSchemaInput) => parseDashSearch(search),
  search: { middlewares: [({search,next}) => compactDashSearch(next(search))] },
  beforeLoad: ({params,location}) => {
    const raw = location.search as Record<string, unknown>
    const clean = compactDashSearch(raw)
    if (Object.keys(raw).some(key => raw[key] !== clean[key])) {
      throw redirect({to:"/sites/$domain",params:{domain:params.domain},search:clean,replace:true})
    }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const me = await meFn()
    const data = await dashboardFn({ data: dashInput(params.domain, deps) })
    return { me, data }
  },
  component: Dashboard,
  errorComponent: ({ error }) => (
    <PageState title="页面出错" description={error instanceof Error ? error.message : undefined} />
  ),
})

function Dashboard() {
  const { me, data } = Route.useLoaderData()
  const { domain } = Route.useParams()
  const search = Route.useSearch()
  const router = useRouter()
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void router.invalidate() }, search.period === "realtime" ? 8000 : 20000)
    return () => window.clearInterval(id)
  }, [router, search.period])
  if (!me && !data.site.public) return <Navigate to="/login" />
  return <Shell user={me} layout="analytics"><AnalyticsDashboard data={data} domain={domain} search={search}
    readonly={!data.access.member} canManage={data.access.canManage}
    onSearch={next => { void router.navigate({to: "/sites/$domain", params: {domain}, search: next}) }}
  /></Shell>
}
