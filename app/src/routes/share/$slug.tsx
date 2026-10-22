import { createFileRoute, useRouter, type SearchSchemaInput } from "@tanstack/react-router"
import { AnalyticsDashboard } from "~/components/AnalyticsDashboard"
import { PageState } from "~/components/PageState"
import { Shell } from "~/components/Shell"
import { shareDashboardFn } from "~/lib/actions"
import { dashInput, parseDashSearch, type DashSearch } from "~/lib/range"

export const Route = createFileRoute("/share/$slug")({
  validateSearch: (search: Partial<DashSearch> & SearchSchemaInput) => parseDashSearch(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const data = await shareDashboardFn({ data: { ...dashInput(params.slug, deps), slug: params.slug } })
    return { data }
  },
  component: SharePage,
  errorComponent: ({ error }) => (
    <PageState title="分享链接无效" description={error instanceof Error ? error.message : undefined} />
  ),
})

function SharePage() {
  const { data } = Route.useLoaderData()
  const search = Route.useSearch()
  const { slug } = Route.useParams()
  const router = useRouter()
  return <Shell layout="analytics"><AnalyticsDashboard data={data} domain={data.site.domain} search={search}
    onSearch={next => { void router.navigate({to: "/share/$slug", params: {slug}, search: next}) }}
  /></Shell>
}
