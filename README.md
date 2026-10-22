# LiteStats

简单、美观、可自托管的网站统计。

LiteStats 是一个类似 Umami 的独立网站分析产品。用一段脚本了解访客从哪里来、浏览了哪些页面，以及发生了哪些事件；访问数据保存在你自己的 PostgreSQL 和 ClickHouse 中。

由 [gentpan](https://github.com/gentpan) 维护，采用 [MIT 许可证](./LICENSE)。

## 能做什么

| 功能 | 说明 |
| --- | --- |
| 访问统计 | 访客、访问次数、浏览量、跳出率、访问时长与趋势对比 |
| 流量分析 | 来源、推广活动、页面、国家/地区、浏览器、系统、设备与语言 |
| 实时与事件 | 实时访客、活动日志、自定义事件及属性采集，支持 SPA、外链点击和文件下载 |
| 多站点管理 | 卡片与列表布局、站点切换、站点权限、公开统计与分享链接 |
| 访客地图 | 本地备用地图；可选 Mapbox，支持标准、街道、深色底图及国旗开关 |
| 搜索关键词 | Google Search Console、Bing Webmaster 接入，CSV 导入及可选 AI SEO 建议 |
| 站点检查 | 可选域名到期、SSL 证书到期和 HTTP 200 检查，无需安装探针 |
| 账号与备份 | 密码、TOTP、Passkey；实例管理员可配置 R2/S3 手动与定时备份、扫描和恢复 |

界面支持中文、英文、手机布局、浅色/深色模式，以及紫、蓝、绿、黑四种配色。

## 快速开始

准备 [Bun](https://bun.sh/) 1.4+ 和 Docker Compose。应用使用 TanStack Start、React、Vite 与 Tailwind CSS；数据库为 PostgreSQL 和 ClickHouse。

```bash
git clone https://github.com/gentpan/LiteStats.git
cd LiteStats
cp .env.example app/.env
docker compose up -d
cd app
bun install --frozen-lockfile
bun run dev
```

启动前在 `app/.env` 中设置自己的 `SESSION_KEY`，建议使用至少 32 字符的随机值。本地 Compose 仅将数据库端口绑定到回环地址；如果已有数据库，修改 `DATABASE_URL` 与 `CLICKHOUSE_URL` 即可。

打开 [http://127.0.0.1:3100](http://127.0.0.1:3100)：

1. `/` 为产品官网，`/register` 创建账号，`/login` 登录。
2. 在 `/dashboard` 添加网站，填写站点域名和时区。
3. 复制安装脚本到被统计网站，在 `/sites/你的域名` 查看统计。

首次使用会自动初始化必要表和字段。`SEED_DEMO` 默认关闭，不会自动创建演示账号。普通注册账号可以管理自己的站点；系统地图与备份设置还要求账号邮箱已验证，并列入 `ADMIN_EMAILS`。当前不提供邮件验证流程，实例管理员需通过可信的数据库管理流程确认邮箱所有权。

## 安装统计脚本

将脚本放在被统计网站的 `<head>` 中，替换为你的统计服务地址和站点域名：

```html
<script defer data-domain="example.com" src="https://stats.example.com/script.js"></script>
```

`defer` 允许脚本并行下载，在 HTML 解析完成后执行。脚本自动记录首次浏览和 SPA 路径、查询参数变化；仅锚点变化或同地址的历史状态更新不会重复计数。

脚本加载后，可发送自定义事件：

```js
window.litestats?.track("Signup", { plan: "pro" })
```

站点设置中的“安装脚本”提供网页集成和 `POST /api/event` 使用文档。采集使用缓冲批量写入：网络中断、脚本拦截、浏览器关闭或服务异常仍可能造成数据缺失，HTTP 202 表示请求已接收，不代表已持久化。访客数使用按站点和日期生成的匿名标识估算；访问时长也不是精确计时。

## 可选功能

### 地图与图标

实例管理员在“设置 → 系统设置 → 访客地图”配置自己的 Mapbox `pk.` 公开 Token。未配置、加载失败或浏览器不支持时使用本地地图；账号可选择底图。公开 Token 会在浏览器使用，应限制允许的站点地址，不要填写 `sk.` 私密 Token。Mapbox 请求及额度归自己的 Mapbox 账号管理。

公网站点和未识别来源的图标统一从 favicon.la 获取，失败时显示本地兜底图标。常见搜索引擎、社交网站、社区与 AI 来源使用内置品牌图标。图标查询会向 favicon.la 提供被查询的域名。

浏览器与系统使用本地品牌图稿，以 [The SVG](https://github.com/glincker/thesvg) 原色 SVG 为主；缺少对应图稿时保留正确的现有资源。来源和授权见 [第三方图标说明](./app/public/brands/THIRD-PARTY.md)。语言行显示名称、地区代码和方形旗帜；旗帜只是语言区域标识，不用于判断访客位置。

### 搜索关键词、CSV 与 AI

在“站点设置 → 集成”连接 Google 或 Bing，在统计页的“关键词”进入工作台。配置、导入和 AI 操作要求站点管理员；工作台不对公开统计或分享链接开放。

- **Google**：启用 Search Console API，创建 Web 应用 OAuth 客户端，登记 `https://stats.example.com/api/auth/google` 回调地址，再保存 Client ID/Secret、执行只读授权并选择本站已验证资源。普通 API Key 无法读取私有 Search Console 数据。
- **Bing**：填写 Bing Webmaster API Key 和平台中已验证的完整站点地址。当前使用的 GetQueryStats 按周更新，不提供看板日期的精确过滤。
- **CSV**：支持 Google/Bing 按关键词汇总的 UTF-8 CSV、中英文表头和导入预览，最多 1 MB、5000 行。按独立批次保存，不覆盖已有统计，也不自动合并重叠日期。
- **AI SEO**：配置兼容 Chat Completions 的公网 HTTPS 接口、模型和 API Key；手动生成时发送当前报告中最多 50 个关键词、汇总指标及站点域名，不发送访客明细、不抓取页面、不自动修改网站。建议需人工判断，模型服务可能收费。

搜索平台的点击量不是独立访客，不能对应某位访客；数据可能延迟、隐藏低频词，也可能与本地日期口径不同。Google 等搜索引擎通常不在引荐链接中公开自然搜索关键词，埋点无法还原未提供的词。

### 域名、证书与 HTTP 检查

站点管理员可在“站点检查”中开启，默认关闭。检查从应用服务器发出，无需客户端或服务器探针；只读成员可查看，公开与分享统计不展示检查信息。

- 域名到期优先使用 RDAP；`.cn`、`.com.cn` 无可用日期时通过 CNNIC 官方 WHOIS 兜底，运行环境需允许出站 TCP 43。查不到时明确提示，不猜测日期。
- 展示 HTTPS 证书到期时间和剩余天数。
- HTTP 通常每 5 分钟检查一次，最多跟随 3 次安全跳转，10 秒超时，最终返回 200 视为正常。它不验证页面正文或浏览器脚本，也不代表所有地区的可达性。

自动检查随生产应用运行；开发模式仅支持手动检查。`LITESTATS_HEALTH_WORKER=false` 可关闭自动执行。只检查标准 HTTPS 公网站点，不包含服务器性能、多节点或资源监控。

### 备份与恢复

实例管理员可在系统设置中连接 Cloudflare R2 或 Amazon S3，测试连接、配置定时备份或手动备份，并扫描和恢复已有备份。连接测试仅验证读取能力，不上传文件。备份包含 PostgreSQL 站点/账号数据和 ClickHouse 事件。

恢复会覆盖当前数据库，应先确认备份与恢复目标。请在安全位置单独保留运行配置，尤其是 `SESSION_KEY`；它也用于加密集成密钥，丢失或更换后可能需要重新配置相应服务。

## 配置与隐私

完整模板见 [.env.example](./.env.example)。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接 |
| `CLICKHOUSE_URL` | ClickHouse HTTP 连接，URL 路径为数据库名 |
| `SESSION_KEY` | 会话签名与服务凭据加密，生产要求至少 32 字符的随机密钥 |
| `ADMIN_EMAILS` | 已验证邮箱的实例管理员列表，逗号分隔 |
| `SEED_DEMO` | 仅非生产环境可显式开启演示数据，默认 `false` |
| `LITESTATS_HEALTH_WORKER` | 设为 `false` 关闭生产站点自动检查 |

访客采集不使用 Cookie 或浏览器本地存储，遵守 `DNT: 1` 与 `Sec-GPC: 1`。服务器处理 IP 和 User-Agent 以生成匿名访客标识，事件表不保存原始 IP；反向代理仍需正确配置可信的来源地址。后台登录使用会话 Cookie，界面偏好与访客埋点分开保存。

页面路径、查询参数、来源链接、标题和事件属性会进入统计；不要在其中放入密码、令牌或个人敏感信息。启用外部地图、图标、搜索平台或 AI 时，会向对应服务发送完成功能所需的信息。自托管并不等于自动满足所有隐私法规，部署者应根据实际采集配置告知访客。

真实 `.env`、密钥、数据库、日志和备份不应提交到 Git。升级前先备份数据库与运行配置，避免覆盖已有凭据。

## 开发与部署

在 `app/` 中运行：

```bash
bun run typecheck
bun test
bun run check:unused
bun run build
```

构建输出在 `app/.output/`，生产使用 Node.js 22，通过 `bun run start` 或 `node .output/start.mjs` 启动。正式部署还需配置 HTTPS、数据库凭据和持久化存储，步骤见 [部署参考](./deploy/README.md)；开发用根目录 Compose 仅包含数据库。

主要目录：`app/src/routes` 为页面和接口，`app/src/components` 为界面，`app/src/lib` 为统计与业务逻辑，`app/public` 为静态资源。更多说明见 [文件索引](./TOC.md) 和 [本地验证记录](./LOCAL-TEST.md)。
