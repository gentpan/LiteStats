import { useState } from "react"
import { UIIcon } from "./UIIcon"
import { TrackingSnippet } from "./TrackingSnippet"
import { useT } from "~/lib/i18n"

export function ApiUsageDocs() {
  const { locale } = useT()
  const en = locale === "en"
  const [openAll, setOpenAll] = useState<boolean | null>(null)

  const toggleAll = () => {
    setOpenAll(prev => (prev === true ? false : true))
  }

  const host = typeof window !== "undefined" ? window.location.host : "127.0.0.1:3100"
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:"
  const baseUrl = `${protocol}//${host}`

  return (
    <section id="api-docs" className="api-usage-docs" aria-label={en ? "API & Developer Documentation" : "API 与开发者使用文档"}>
      <div className="api-docs-header">
        <div>
          <h3>
            <UIIcon name="code" />
            {en ? "Developer Documentation & Usage Guide" : "开发者使用指南与接口文档"}
          </h3>
          <p className="api-docs-lead">
            {en
              ? "Comprehensive integration guide for data ingestion, tracking scripts, server monitoring, and API key authentication."
              : "提供 HTTP 事件采集、网页埋点脚本、服务器探针上报及 API 密钥认证的使用规范与调用代码示例。"}
          </p>
        </div>
        <button
          type="button"
          className="api-docs-toggle-btn"
          onClick={toggleAll}
          title={openAll === true ? (en ? "Collapse all sections" : "收起所有折叠") : (en ? "Expand all sections" : "展开所有折叠")}
        >
          <UIIcon name="refresh" />
          <span>{openAll === true ? (en ? "全部折叠" : "全部折叠") : (en ? "全部展开" : "全部展开")}</span>
        </button>
      </div>

      <div className="api-docs-sections">
        {/* Section 1: Authentication */}
        <details className="api-doc-item" open={openAll ?? true}>
          <summary className="api-doc-summary">
            <div className="api-doc-summary-title">
              <UIIcon name="key" />
              <span>{en ? "1. API Key Authentication & Request Headers" : "1. API 密钥认证与请求头规范"}</span>
            </div>
            <span className="api-doc-badge">{en ? "Authentication" : "鉴权规范"}</span>
          </summary>
          <div className="api-doc-content">
            <p>
              {en
                ? "Authenticate requests by passing your personal API key in standard HTTP headers:"
                : "调用 LiteStats API 时，可通过标准 Authorization 或 X-Api-Key 请求头携带您的个人密钥进行身份验证："}
            </p>
            <div className="api-doc-headers">
              <div className="api-header-row">
                <code>Authorization: Bearer &lt;YOUR_API_KEY&gt;</code>
              </div>
              <div className="api-header-row">
                <code>X-Api-Key: &lt;YOUR_API_KEY&gt;</code>
              </div>
            </div>

            <h4>{en ? "Key Scopes & Permissions" : "密钥权限类型与作用域"}</h4>
            <div className="api-doc-table">
              <table>
                <thead>
                  <tr>
                    <th>{en ? "Type" : "类型"}</th>
                    <th>{en ? "Scope Marker" : "权限标记"}</th>
                    <th>{en ? "Description" : "功能说明"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{en ? "Stats API" : "统计 API"}</strong></td>
                    <td><code>stats:read</code></td>
                    <td>{en ? "Read site metrics, trends, referrer channels, pages, geography and devices." : "读取站点访客量、浏览量、跳出率、来源渠道、受访页面、国家地域和设备等统计数据。"}</td>
                  </tr>
                  <tr>
                    <td><strong>{en ? "Sites API" : "站点 API"}</strong></td>
                    <td><code>sites:provision:*</code></td>
                    <td>{en ? "Site management, domain bindings, and automated provisioning." : "站点创建、域名绑定与自动化编排权限。"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4>{en ? "Managing Your Keys" : "密钥管理指引"}</h4>
            <ol>
              <li>{en ? "Click 'New API Key' above to generate a key with a descriptive name." : "点击上方“新建 API 密钥”生成带有对应权限的密钥，填写描述性名称便于识别。"}</li>
              <li>{en ? "Save the full key immediately; LiteStats never displays it again after creation." : "创建后请立即妥善保存完整密钥，系统只展示一次，之后无法找回。"}</li>
              <li>{en ? "Revoke unneeded or exposed keys immediately; revocation takes effect instantly." : "不再使用或怀疑泄露时及时点击“撤销”，撤销操作即时生效。"}</li>
            </ol>
          </div>
        </details>

        {/* Section 2: HTTP Event Ingestion API */}
        <details className="api-doc-item" open={openAll ?? true}>
          <summary className="api-doc-summary">
            <div className="api-doc-summary-title">
              <UIIcon name="cloud" />
              <span>{en ? "2. HTTP Event Ingestion Endpoint (POST /api/event)" : "2. HTTP 事件数据采集端点 (POST /api/event)"}</span>
            </div>
            <span className="api-doc-badge">{en ? "Ingestion API" : "采集接口"}</span>
          </summary>
          <div className="api-doc-content">
            <p>
              {en
                ? "Ingest pageviews and custom conversion events directly from backend services, mobile apps (iOS / Android), mini-programs, CLI tools, or serverless functions without a browser:"
                : "支持从后端服务、移动 App、微信小程序、命令行脚本或无前端浏览器环境中直接向 LiteStats 上报页面访问与业务事件："}
            </p>
            <div className="api-endpoint-badge">
              <span className="method-post">POST</span>
              <code>/api/event</code>
              <span className="endpoint-desc">{en ? "Micro-batched, non-blocking ingestion" : "微批缓冲，毫秒级非阻塞入库"}</span>
            </div>

            <h4>{en ? "Request Payload Format (JSON)" : "请求体参数格式 (JSON)"}</h4>
            <div className="api-doc-table">
              <table>
                <thead>
                  <tr>
                    <th>{en ? "Field" : "字段"}</th>
                    <th>{en ? "Type" : "类型"}</th>
                    <th>{en ? "Required" : "必须"}</th>
                    <th>{en ? "Description" : "说明"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>d</code> / <code>domain</code></td>
                    <td>string</td>
                    <td><span className="tag-required">{en ? "Required" : "必须"}</span></td>
                    <td>{en ? "Target site domain registered in LiteStats (e.g. demo.local.test)" : "在 LiteStats 中添加的站点域名（如 demo.local.test）"}</td>
                  </tr>
                  <tr>
                    <td><code>n</code> / <code>name</code></td>
                    <td>string</td>
                    <td><span className="tag-required">{en ? "Required" : "必须"}</span></td>
                    <td>{en ? "Event name ('pageview' for page visits, or custom action like 'Signup')" : "事件名称（基础浏览填 'pageview'，自定义行为填如 'Signup'）"}</td>
                  </tr>
                  <tr>
                    <td><code>u</code> / <code>url</code></td>
                    <td>string</td>
                    <td><span className="tag-required">{en ? "Required" : "必须"}</span></td>
                    <td>{en ? "Full URL of the tracked resource (e.g. https://example.com/pricing)" : "当前页面完整 URL（如 https://example.com/pricing）"}</td>
                  </tr>
                  <tr>
                    <td><code>r</code> / <code>referrer</code></td>
                    <td>string</td>
                    <td><span className="tag-optional">{en ? "Optional" : "可选"}</span></td>
                    <td>{en ? "Referrer URL (e.g. https://google.com)" : "访问来源 Referrer（如 https://google.com）"}</td>
                  </tr>
                  <tr>
                    <td><code>w</code> / <code>width</code></td>
                    <td>number</td>
                    <td><span className="tag-optional">{en ? "Optional" : "可选"}</span></td>
                    <td>{en ? "Client viewport screen width in pixels (e.g. 1440)" : "客户端屏幕宽度像素（如 1440，用于识别移动/桌面设备）"}</td>
                  </tr>
                  <tr>
                    <td><code>p</code> / <code>props</code></td>
                    <td>object</td>
                    <td><span className="tag-optional">{en ? "Optional" : "可选"}</span></td>
                    <td>{en ? "Custom key-value metadata (e.g. {\"plan\": \"pro\", \"source\": \"hero\"})" : "自定义维度键值对（如 {\"plan\": \"pro\", \"source\": \"hero\"}）"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4>{en ? "cURL Code Example" : "cURL 上报调用示例"}</h4>
            <TrackingSnippet
              code={`curl -X POST ${baseUrl}/api/event \\
  -H "Content-Type: application/json" \\
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \\
  -d '{
    "d": "demo.local.test",
    "n": "pageview",
    "u": "${baseUrl}/docs",
    "r": "https://google.com",
    "w": 1440,
    "p": { "plan": "pro" }
  }'`}
              language="cURL"
            />
            <p className="api-note">
              {en
                ? "Returns HTTP 202 Accepted with 'ok'. LiteStats strictly respects Do-Not-Track (DNT: 1) and Global Privacy Control (Sec-GPC: 1) headers."
                : "接口返回 HTTP 202 Accepted 状态码与文本 'ok'。LiteStats 严格遵守 Do-Not-Track (DNT: 1) 与 Sec-GPC 隐私标头，内存微批缓冲落盘至 ClickHouse。"}
            </p>
          </div>
        </details>

        {/* Section 3: Web Tracker Integration */}
        <details className="api-doc-item" open={openAll ?? false}>
          <summary className="api-doc-summary">
            <div className="api-doc-summary-title">
              <UIIcon name="globe" />
              <span>{en ? "3. Web Tracking Script & JavaScript API" : "3. 网页埋点脚本与 JavaScript API"}</span>
            </div>
            <span className="api-doc-badge">{en ? "Frontend SDK" : "网页集成"}</span>
          </summary>
          <div className="api-doc-content">
            <p>
              {en
                ? "Embed the lightweight tracker in your website <head>. It automatically tracks pageviews, hash navigation, and history changes in single-page apps (SPA):"
                : "将极简统计脚本放入网站的 <head> 标签内，自动追踪访客、访问时长、来源并原生兼容单页应用 (SPA) 路由切换："}
            </p>
            <TrackingSnippet
              code={`<script defer data-domain="YOUR_DOMAIN" src="${baseUrl}/js/script.js"></script>`}
              language="HTML"
            />

            <h4>{en ? "Triggering Custom Events in JavaScript" : "在 JavaScript 中触发自定义事件"}</h4>
            <p>
              {en
                ? "Track custom actions from anywhere in your web app:"
                : "在页面任意交互事件中调用 window.litestats.track()："}
            </p>
            <TrackingSnippet
              code={`// 自定义事件上报
if (window.litestats) {
  window.litestats.track("Button Click");
}`}
              language="JavaScript"
            />
          </div>
        </details>

        {/* Section 4: Server Monitoring Agent */}
        <details className="api-doc-item" open={openAll ?? false}>
          <summary className="api-doc-summary">
            <div className="api-doc-summary-title">
              <UIIcon name="activity" />
              <span>{en ? "4. Server Monitoring Agent Protocol (POST /api/monitor/update)" : "4. 服务器探针上报协议 (POST /api/monitor/update)"}</span>
            </div>
            <span className="api-doc-badge">{en ? "Server Agent" : "探针协议"}</span>
          </summary>
          <div className="api-doc-content">
            <p>
              {en
                ? "LiteStats includes its own server monitoring agent (litestats-agent). It regularly reports CPU, RAM, disk usage, and network traffic without third-party dependencies."
                : "LiteStats 内置轻量服务器探针，自动定期向监控端点汇报 CPU、内存、磁盘和网络流量，无需依赖任何第三方服务。"}
            </p>
            <h4>{en ? "Agent Deployment Command" : "探针一键安装命令"}</h4>
            <TrackingSnippet
              code={`curl -fsSL ${baseUrl}/install.sh | sudo sh -s -- \\
  --url ${baseUrl} \\
  --id YOUR_SERVER_ID \\
  --secret YOUR_SERVER_SECRET`}
              language="Bash"
            />
            <p className="api-note">
              {en
                ? "The agent reports to POST /api/monitor/update using X-Server-Id and X-Server-Secret authentication headers."
                : "探针使用系统分配的 X-Server-Id 与 X-Server-Secret 标头向 POST /api/monitor/update 进行身份认证并安全推送时序指标。"}
            </p>
          </div>
        </details>

        {/* Section 5: Data Access & Future API */}
        <details className="api-doc-item" open={openAll ?? false}>
          <summary className="api-doc-summary">
            <div className="api-doc-summary-title">
              <UIIcon name="download" />
              <span>{en ? "5. Data Querying & Export Roadmap" : "5. 数据获取与开放 API 规划"}</span>
            </div>
            <span className="api-doc-badge">{en ? "Roadmap" : "接口路线"}</span>
          </summary>
          <div className="api-doc-content">
            <p>
              {en
                ? "LiteStats allows viewing and exporting analytics data across all dimensions:"
                : "当前 LiteStats 支持全维度看板交互与数据导出，后续版本将全面接入通过 API Key 直接读取数据的 REST 接口："}
            </p>
            <div className="api-doc-table">
              <table>
                <thead>
                  <tr>
                    <th>{en ? "Data Content" : "数据内容"}</th>
                    <th>{en ? "Current Access Method" : "当前获取方式"}</th>
                    <th>{en ? "REST API Endpoint" : "开放 API 规划"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{en ? "Visitors, Pageviews, Bounce Rate, Duration" : "访客、浏览量、跳出率、访问时长"}</td>
                    <td>{en ? "Site Dashboard (Real-time)" : "站点大屏看板（实时展示）"}</td>
                    <td><code>GET /api/v1/stats/aggregate</code></td>
                  </tr>
                  <tr>
                    <td>{en ? "Trends, Referrers, Pages, Countries, Devices" : "访问趋势、来源、页面、国家、设备"}</td>
                    <td>{en ? "Dashboard & CSV/JSON Export" : "大屏维度下钻 & 报表 CSV/JSON 导出"}</td>
                    <td><code>GET /api/v1/stats/breakdown</code></td>
                  </tr>
                  <tr>
                    <td>{en ? "Sites, Team & Domain Configurations" : "站点列表、成员与域名配置"}</td>
                    <td>{en ? "Management Console" : "控制台管理界面"}</td>
                    <td><code>GET /api/v1/sites</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
