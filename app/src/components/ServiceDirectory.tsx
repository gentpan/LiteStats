import { Link } from "@tanstack/react-router"
import { BrandIcon, UIIcon } from "./UIIcon"
import { Tile } from "./ui"
import { useT } from "~/lib/i18n"

export function ServiceDirectory({ sites }: { sites: Array<{ domain: string }> }) {
  const { t } = useT()
  return (
    <Tile
      icon="grid"
      title={t("服务与 API 配置")}
      subtitle={t("管理第三方服务凭据（Google Maps、Mapbox、Google 搜索与 Bing 搜索）。")}
    >
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
          <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
            <BrandIcon name="google-maps" />
            <span>Google Maps</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            {t("配置 Google Maps JavaScript API Key，用于统计报表中的全球访客分布地图。")}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
          <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
            <BrandIcon name="mapbox" />
            <span>Mapbox</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            {t("配置 Mapbox 公开 Access Token（pk.）与自定义样式，作为地图可选展示方案。")}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
          <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
            <BrandIcon name="google" />
            <span>Google Search Console</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            {t("配置 Google OAuth 客户端凭据，授权拉取搜索关键词、展现量与点击率数据。")}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
          <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
            <BrandIcon name="bing" />
            <span>Bing Webmaster</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            {t("配置 Bing Webmaster API Key 与站点验证地址，同步必应搜索引擎访问词。")}
          </p>
        </div>
      </div>

      <div className="service-section-heading !mt-0 !pt-4">
        <UIIcon name="globe" />
        <div>
          <h3>{t("各站点服务与密钥配置")}</h3>
          <p>{t("第三方服务凭据按站点独立保存。点击对应服务即可直接进入配置与输入密钥。")}</p>
        </div>
      </div>

      <div className="site-service-list">
        {sites.map((site) => (
          <section className="site-service" key={site.domain}>
            <h4>
              <UIIcon name="globe" />
              <span>{site.domain}</span>
            </h4>
            <div className="service-shortcuts">
              <Link
                to="/sites/$domain/settings"
                params={{ domain: site.domain }}
                search={{ tab: "map" }}
                className="service-shortcut"
              >
                <BrandIcon name="google-maps" />
                <span>Google Maps {t("配置")}</span>
                <UIIcon name="arrow" />
              </Link>
              <Link
                to="/sites/$domain/settings"
                params={{ domain: site.domain }}
                search={{ tab: "map" }}
                className="service-shortcut"
              >
                <BrandIcon name="mapbox" />
                <span>Mapbox {t("配置")}</span>
                <UIIcon name="arrow" />
              </Link>
              <Link
                to="/sites/$domain/settings"
                params={{ domain: site.domain }}
                search={{ tab: "integrations" }}
                className="service-shortcut"
              >
                <BrandIcon name="google" />
                <span>Google Search {t("配置")}</span>
                <UIIcon name="arrow" />
              </Link>
              <Link
                to="/sites/$domain/settings"
                params={{ domain: site.domain }}
                search={{ tab: "integrations" }}
                className="service-shortcut"
              >
                <BrandIcon name="bing" />
                <span>Bing {t("配置")}</span>
                <UIIcon name="arrow" />
              </Link>
            </div>
          </section>
        ))}
      </div>

      {!sites.length ? (
        <p className="settings-empty">
          <UIIcon name="globe" />
          {t("添加站点后可配置第三方服务密钥。")}
        </p>
      ) : null}
    </Tile>
  )
}
