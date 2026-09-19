import { Link } from "@tanstack/react-router"
import { Shell } from "./Shell"
import { Surface } from "./Surface"
import { UIIcon } from "./UIIcon"
import { useT } from "~/lib/i18n"

export function PageState({ title, description }: { title: string; description?: string }) {
  const { t } = useT()
  return <Shell><Surface className="page-state">
    <span className="settings-card-icon"><UIIcon name="warn" /></span>
    <h1 className="page-heading">{t(title)}</h1>
    {description ? <p>{t(description)}</p> : null}
    <Link to="/" className="btn btn-primary"><UIIcon name="arrow" />{t("返回站点")}</Link>
  </Surface></Shell>
}
