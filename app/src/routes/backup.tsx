import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { BackupPanel } from "~/components/BackupPanel"
import { BackArrow, SettingsHeader } from "~/components/SettingsChrome"
import { Shell } from "~/components/Shell"
import { backupSettingsFn, meFn } from "~/lib/actions"
import { useT } from "~/lib/i18n"

export const Route = createFileRoute("/backup")({
  loader: async () => {
    const me = await meFn()
    if (!me) return { me: null, settings: null }
    return { me, settings: await backupSettingsFn() }
  },
  component: BackupPage,
})

function BackupPage() {
  const { me, settings } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useT()
  if (!me || !settings) {
    void router.navigate({ to: "/login" })
    return null
  }
  return (
    <Shell user={me}>
      <div>
        <SettingsHeader
          title={t("backup.title")}
          icon="cloud"
          back={(
            <Link to="/" className="btn btn-secondary btn-sm settings-back">
              <BackArrow />
              {t("settings.back_sites")}
            </Link>
          )}
        />
        <BackupPanel initial={settings} />
      </div>
    </Shell>
  )
}
