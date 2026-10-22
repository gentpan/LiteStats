# LiteStats

轻量、隐私友好的自托管网站访问统计，聚焦访客、流量来源、页面和转化。访客采集无 Cookie，数据留在你自己的 PostgreSQL 和 ClickHouse 里。

**仓库：** [github.com/gentpan/LiteStats](https://github.com/gentpan/LiteStats)

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [嵌入追踪脚本](#嵌入追踪脚本)
- [站点检查](#站点检查)
- [目标、属性和漏斗](#目标属性和漏斗)
- [项目结构](#项目结构)
- [环境变量](#环境变量)
- [许可证](#许可证)

更细的文件地图见 [TOC.md](./TOC.md)。

当前以站点访问统计为主，另提供可按站点开启的域名到期、SSL 证书到期和 HTTP 200 检查。服务器资源采集、Linux Agent、三网探测和多节点监控已移除；历史统计及旧监控表保留。

## 特性

- **轻量脚本** — `/script.js` 自动报 pageview，兼容 SPA；可跟自定义事件、外链和文件下载
- **单页看板** — 访客、访问、浏览、来源、页面、地区、设备、实时
- **站点布局** — 三列卡片或单列列表，当前浏览器记住选择；卡片在平板两列、手机一列
- **事件** — 自定义事件与属性采集，可在活动日志查看；目标配置、属性分析与漏斗报表尚未完成
- **分享** — 公开站点或分享链接
- **账号** — 邮箱密码、TOTP、Passkey，中英文和浅色/深色
- **界面偏好** — 四种配色同步应用图标；个人账号可选择标准、街道、深色 3 款 Mapbox 底图，附真实预览；地图国旗可开关
- **站点检查** — 域名与证书剩余天数、网站响应曲线及检查状态；无需安装探针
- **备份** — 支持 R2/S3，提供不保存设置的只读连接测试、定时备份、扫描与恢复

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) ≥ 1.4 |
| 应用 | TanStack Start + React + Vite + Tailwind 4 |
| 关系库 | PostgreSQL |
| 事件库 | ClickHouse |

首次启动会自动建表并补齐必要字段。正式升级前应备份已有数据库。

## 快速开始

依赖：Bun 1.4+、Docker（或自备 PostgreSQL 与 ClickHouse）。

```bash
git clone https://github.com/gentpan/LiteStats.git
cd LiteStats
cp .env.example app/.env
docker compose up -d
cd app
bun install
bun run dev
```

默认开发地址是 [http://127.0.0.1:3100](http://127.0.0.1:3100)。只有显式设置 `SEED_DEMO=true` 且不是生产环境才创建演示账号 `demo@litestats.dev` / `12345678`；已有账号密码不会被重置。

生产需要设置至少 32 位随机 `SESSION_KEY`。`ADMIN_EMAILS` 指定已验证邮箱的实例管理员，全局备份只允许实例管理员访问。普通注册不会自动验证邮箱。团队创建、邀请和成员管理已移除；现有站点归属记录仅用于兼容历史数据和访问权限。生产管理员应通过受信任的数据库管理流程确认其邮箱所有权。

本地开发与测试步骤见 [本地测试说明](./LOCAL-TEST.md)。开发用 compose 提供数据库，应用需要单独启动。

如果本机已经有 Postgres / ClickHouse，改 `DATABASE_URL` 和 `CLICKHOUSE_URL` 即可，不必起 compose。

## 嵌入追踪脚本

站点创建后，把下面这段放到网站 `</head>` 前：

```html
<script defer data-domain="example.com" src="https://你的域名/script.js"></script>
```

自定义事件：

```js
litestats.track("Signup", { plan: "pro" })
```

## 站点检查

添加网站后可直接进入“站点检查”，也可从统计看板页头打开。默认关闭，站点管理员点击“开启检查”后开始记录，无须先安装统计脚本。只读成员可查看，只有站点管理员可开启、暂停和修改；公开统计与分享链接不公开检查信息。

- **域名到期**：显示可注册域名的到期日期和剩余天数。优先查询 [IANA RDAP 服务目录](https://data.iana.org/rdap/dns.json)；`.cn`（包括 `.com.cn`）没有可用 RDAP 日期时，自动使用 CNNIC 官方 `whois.cnnic.cn:43` 兜底，无需 API Key。运行网络须允许出站 TCP 43；超时、受限、未返回记录或日期会分别提示，不猜测日期。WHOIS 时间未注明时区时只保留公开日期，按日期估算剩余天数。子域名显示其所属可注册域名的日期，不展示 IP、归属地、服务商或 WHOIS 联系人信息。
- **证书到期**：显示站点 HTTPS 证书的到期日期和剩余天数；不足 30 天提示，过期或校验失败标记异常。域名和证书到期信息每日至多自动刷新一次。
- **HTTP 检查**：通常每 5 分钟请求一次站点 HTTPS 地址，可配置 `/`、`/health` 等本站路径。最多跟随 3 次安全跳转，最终 HTTP 200 为正常，10 秒超时。响应时间计到响应头，页面正文不会保存；这不验证页面内容或浏览器脚本。
- **图表**：展示近 24 小时的响应曲线和状态条；缺失记录保持空白。成功率仅统计实际检查样本，不把未检查时段当作正常。检查从应用所在服务器发出，结果代表该服务器的访问情况。

生产构建 `bun run build` 后以 `bun run start` 启动，后台定时任务随应用运行，无需保持网页打开。开发模式不启动定时任务；设置 `LITESTATS_HEALTH_WORKER=false` 可关闭自动执行，管理员手动检查仍可使用。多进程通过数据库争抢任务，避免重复检查。

只允许标准 HTTPS 公网站点；请求和每次跳转都会校验地址，拒绝内网及保留地址。新记录使用独立的 `site_check_settings`、`site_check_results` 表，不读取或改写旧监控记录，也不删除统计或检查历史。暂停后保留已有记录。此功能不发送邮件或消息通知。

## 目标、属性和漏斗

目前支持自定义事件及属性采集，活动日志可查看事件。目标管理、属性分析与漏斗统计尚未形成完整流程，不应按已实现能力使用。已有目标、漏斗和属性数据及相关表结构保留。

## 搜索关键词

统计页的“来源”卡片 → “搜索词”提供三种数据：

- **引荐搜索词**：只解析搜索引擎来源链接实际携带的词，按本地独立访客计数。Google 等搜索引擎通常不会传递自然搜索关键词；缺失的词无法从埋点或服务器日志还原，也不会根据页面内容猜测。推广链接的 `utm_term` 不当作自然搜索词。
- **Google 搜索词**：在“站点设置 → 集成”配置 Google OAuth、授权 Search Console 并选择已验证资源后，按所选日期查询整站搜索点击量。按 Google 的太平洋时间日界限统计，不跟随本地访客筛选；实时/滚动 24 小时需改选按日区间。部分低频词会隐藏，最近的数据可能延迟。
- **Bing 搜索词**：在同一设置页填写 Bing Webmaster API Key 和已验证站点地址，汇总接口可用的搜索点击量。现用 GetQueryStats 接口按周更新，不能精确对应看板所选日期；界面明确标注其不跟随上方日期与访客筛选。

官方关键词最多显示前 50 个词，数值是搜索结果点击次数，不是独立访客，也不能与某位访客一一对应。未连接、需选择资源、授权失败、超时和无结果分别提示。详细口径见 [Google Search Console 数据说明](https://support.google.com/webmasters/answer/96568?hl=zh-Hans) 和 [Bing 搜索表现说明](https://www.bing.com/webmasters/help/search-performance-c680da36)。

### 关键词接入、CSV 与 AI SEO 建议

统计页工具栏的“关键词”进入独立工作台，展示 Google/Bing 的点击、展现、点击率和平均排名；只对本站成员开放，不放入公开或分享页。接入配置、CSV 导入及 AI 操作要求站点管理员。

- **Google**：在 Google Cloud 启用 Search Console API，创建 Web 应用 OAuth 客户端，将本站 `/api/auth/google` 的完整地址登记为回调；在站点集成中保存 Client ID/Secret，执行只读授权，再选择本站对应的已验证资源。普通 API Key 不能读取私有 Search Console 数据。
- **Bing**：填写 Webmaster Tools 提供的 API Key 和平台中已验证的完整站点地址。GetQueryStats 按周更新，工作台不提供虚假的日期过滤。平均排名使用 `AvgImpressionPosition`；重复词按展现量加权，缺失指标保留空值。
- **CSV**：导入搜索平台按关键词汇总的 UTF-8 CSV，支持中英文表头、引号和千分位，最多 1 MB / 5000 行。预览后填写来源和导出日期再确认。每次独立保存为 `site_keyword_imports` 批次，不覆盖历史、不自动合并重叠日期；列表展示最近 30 份，重复词或非法指标给出行号。百分比表头（如 `CTR (%)`）中的 `0.8` 按 `0.8%` 读取；零排名与缺失排名显示为 `—`。
- **AI SEO**：在关键词页填写完整 HTTPS Chat Completions 接口、模型名和 API Key，支持 `max_completion_tokens` / `max_tokens`。手动点击“生成建议”才发送当前报告中最多 50 个关键词及汇总指标和站点域名；不发送访客记录、不抓取页面、不自动改网站。报告标明来源/范围/模型，建议仅作待人工验证的方向，不保证排名。

搜索平台资源必须属于本站域名或 `www` 别名，Google 资源还需当前授权账号拥有访问权限；同域名的 URL 前缀资源保持其实际范围。更换 Google 账号不会继承旧账号的令牌或资源。新保存的 Google Token、Bing Key 和 OAuth 配置使用绑定站点及字段的 AES-GCM 加密；旧记录兼容读取，不自动迁移或写回。公开与分享统计保持原有关键词点击字段，不返回工作台新增的详细指标和资源地址。

AI 配置和建议历史分别保存在新的 `site_seo_ai_config` / `site_seo_ai_reports`，用 `SESSION_KEY` 派生密钥加密。请保留此密钥；轮换后需重新保存受影响的服务配置。无法解密的旧建议保留原记录并提示，不阻止生成新的建议。可以移除配置和密钥，历史仍保留。生成请求核对当前已保存的接口、模型和参数；有未保存修改或其他页面已更改服务时，须先保存或刷新确认。请求限制公网 HTTPS、验证 TLS 和全部 DNS 地址、禁止跳转，45 秒超时；每站点一分钟最多一次。模型服务可能收费，费用由用户所配置的服务商收取。首次访问相应功能会创建新表，不修改已有统计记录。

## 项目结构

```
LiteStats/
├── app/                 # 网站、API、采集、看板
│   ├── public/          # 国旗、图标与静态资源
│   ├── server/plugins/  # 站点检查定时任务
│   └── src/
│       ├── routes/      # 页面与 /api/*
│       ├── components/
│       └── lib/         # Postgres、ClickHouse、会话、统计查询
├── docker-compose.yml   # 本地 Postgres + ClickHouse
├── README.md
└── TOC.md
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `CLICKHOUSE_URL` | ClickHouse HTTP，含数据库名 |
| `SESSION_KEY` | 会话 HMAC，生产必须更换 |
| `LITESTATS_HEALTH_WORKER` | 生产默认启用定时检查；`false` 关闭自动执行 |
| `GOOGLE_CLIENT_ID` 等 | 可选，Search Console 关键词 |

完整模板见 [.env.example](./.env.example)。不要提交真实 `.env`。

## 许可证

MIT，见 [LICENSE](./LICENSE)。

### 统一设置入口

页头“设置”进入 `/account`，左侧按权限分组：

- 账号设置：个人资料和安全（密码、TOTP、Passkey）。
- 系统设置（实例管理员）：访客地图、备份与恢复。旧 `/backup` 自动进入 `/account?tab=system/backup`。
- 站点设置：常规、可见性、安装脚本、Google/Bing 搜索集成和危险操作。安装页提供脚本、自定义事件和 HTTP 采集文档；统计导出保留在看板“更多”菜单。

访客地图支持 Mapbox。管理员进入“设置 → 系统设置 → 访客地图”（`/account?tab=system/mapbox`），填写自己的 `pk.` 公开 Access Token 并保存，重新打开统计页后生效。配置统一应用于站点看板和分享页，保留国家筛选、缩放、拖动、实时标记和深浅主题。SDK 和样式在地图接近可视区域时才加载；未配置、停用、授权失败或不支持 WebGL 时显示本地备用地图。

Token 加密保存，设置页不回显，留空保留已有值。浏览器使用公开 Token 获取 Mapbox 底图，因此应按 [Mapbox 安全建议](https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/) 限制为本站访问域名，开启 `styles:read`、`fonts:read`，不要使用 `sk.` 私密密钥。访客国家统计只在本地叠加，不上传访客明细。Mapbox 在线底图的请求和额度由用户自己的账号管理。

通知通道（SMTP/Telegram）、Google Maps、个人 API 密钥及冗余的服务配置索引已经移出当前版本。Mapbox 按 2026-10-22 的新要求独立接入；新配置使用 `litestats_mapbox_settings`，不读取、解密或修改旧 `site_map_settings`。旧配置表及记录原样保留，旧标签仍回到个人偏好或站点常规设置。

备份仍包含历史表和新地图配置。保留原有 `SESSION_KEY`，以便解密仍在使用的地图、搜索集成和备份配置；更换此值后需要重新填写 Mapbox Token。本轮不执行已有数据库迁移、去重、恢复或生产部署。

### 域名与兼容

新增站点和改域名会统一处理大小写、`www.`、URL 路径和端口，并在同一事务内校验冲突、串行处理并发声明。不自动建立唯一索引或修正历史重复记录；原有重复站点允许保存其他设置。采集兼容历史中文、`www.` 和端口域名，优先匹配原域名；仍有歧义时按最早站点 ID 确定归属。

`/script.js`、`/js/script.js`、`/tracker.js` 共用同一脚本响应。普通、公开和分享看板共用展示组件，读取权限与管理权限由服务端分别确定。占位的屏蔽、邮件报告和导入导出说明页已移除，旧标签回到常规设置。
