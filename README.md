# LiteStats

轻量、隐私友好的网站访问统计。无 Cookie、可自托管，对标 Plausible / Umami 的简洁体验，内置专业 Dashboard、GeoIP 国家分布、Passkey 登录。

**在线演示：** [litestats.dev](https://litestats.dev)

## 特性

- **轻量追踪脚本** — `tracker.js` 约 1KB，支持 SPA 路由自动上报
- **隐私优先** — 不种 Cookie；访客 ID 由 IP + UA + 站点盐值哈希，不存原始 IP
- **专业 Dashboard** — 总览、趋势图（Chart.js）、来源、页面、设备、国家分布
- **GeoIP** — 采集时通过 [cnip.io](https://cnip.io) API 解析国家，配合本地 / CDN 国旗 SVG
- **站点 Favicon** — 通过 [favicon.la](https://favicon.la) 展示站点图标
- **Passkey 登录** — WebAuthn 无密码登录，支持修改密码与多设备管理
- **Umami 迁移** — 附带导出 / 导入脚本，可迁移历史数据
- **一键生产部署** — Docker Compose + Caddy 自动 HTTPS

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| 框架 | Next.js 16 (App Router) |
| 数据库 | PostgreSQL + Prisma |
| 图表 | Chart.js |
| 认证 | JWT + [@simplewebauthn](https://simplewebauthn.dev) |
| 生产 | Docker + Caddy |

## 快速开始（本地开发）

### 依赖

- Bun 1.3+
- Docker（推荐 [Colima](https://github.com/abiosoft/colima)）

### 启动

```bash
git clone https://github.com/gentpan/LiteStats.git
cd LiteStats

# 启动 PostgreSQL
bun run db:up

# 配置环境变量
cp .env.example apps/web/.env
# 编辑 DATABASE_URL 等（默认连接 localhost:5432）

# 初始化数据库
bun run db:push
bun run db:seed          # 默认 admin / litestats

# 开发
bun run dev
```

访问 http://localhost:3000 ，使用 `admin` / `litestats` 登录。

### 嵌入追踪代码

在 Dashboard 创建站点后，将以下代码放入网站 `</head>` 前：

```html
<script defer data-tracking-id="你的_TRACKING_ID" src="https://你的域名/tracker.js"></script>
```

自定义事件：

```js
litestats.track('signup', { plan: 'pro' });
```

## 生产部署

```bash
cp .env.production.example .env.production
# 编辑域名、密钥、邮箱

bun run prod:up
```

从本机同步到已部署服务器（`scripts/deploy-prod.sh`）：

```bash
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

架构：`Internet → Caddy (:443) → Next.js (:3000) → PostgreSQL`

详细说明见 [deploy/README.md](./deploy/README.md)。

### 环境变量（生产）

| 变量 | 说明 |
|------|------|
| `DOMAIN` | 对外域名，如 `litestats.dev` |
| `AUTH_SECRET` / `HASH_SALT` | 随机密钥，务必更换 |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | Passkey 域名（须 HTTPS） |
| `GEOIP_API_URL` | GeoIP 接口，默认 `https://api.cnip.io/geoip` |
| `NEXT_PUBLIC_FLAG_BASE_URL` | 国旗 CDN，默认 `/flags`（本地） |
| `NEXT_PUBLIC_FAVICON_BASE_URL` | Favicon 服务，默认 `https://favicon.la` |

### 国旗资源

项目已内置 `apps/web/public/flags/`（1x1 / 4x3 SVG）。若需重新解压：

```bash
./scripts/setup-flags.sh ~/Downloads/flags.zip
```

## 从 Umami 迁移

```bash
# 1. 从 Umami 服务器导出
./scripts/export-umami.sh

# 2. 导入 LiteStats 数据库
cd apps/web
UMAMI_DATA_DIR=../../data/umami-export bun run db:import-umami
```

## 项目结构

```
LiteStats/
├── apps/web/              # Next.js 应用
│   ├── prisma/            # 数据模型、seed、Umami 导入
│   ├── public/tracker.js  # 追踪脚本（构建自 packages/tracker）
│   └── src/
├── packages/tracker/      # 追踪脚本源码
├── deploy/                # Caddy、entrypoint、部署文档
├── scripts/               # 导出 / 国旗安装脚本
├── docker-compose.yml     # 本地 Postgres
└── docker-compose.prod.yml
```

## API 概览

| 端点 | 说明 |
|------|------|
| `POST /api/collect` | 采集 pageview / 自定义事件 |
| `GET /api/stats/:websiteId` | 站点统计（需登录） |
| `GET /api/health` | 健康检查 |

## 安全建议

1. 首次登录后立即修改默认密码
2. 注册 Passkey 后可将密码作为备用
3. 生产环境设置 `RUN_DB_SEED=false`
4. 勿将 `.env.production` 提交到 Git

## License

MIT — 见 [LICENSE](./LICENSE)

## 相关项目

- [Plausible](https://plausible.io)
- [Umami](https://umami.is)
- [flagcdn.io](https://flagcdn.io) · [favicon.la](https://favicon.la) · [cnip.io](https://cnip.io)
