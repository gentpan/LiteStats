# LiteStats

轻量、隐私友好的自托管网站统计，顺带做服务器监控。无 Cookie，数据留在你自己的 PostgreSQL 和 ClickHouse 里。

**仓库：** [github.com/gentpan/LiteStats](https://github.com/gentpan/LiteStats)

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [嵌入追踪脚本](#嵌入追踪脚本)
- [服务器探针](#服务器探针)
- [目标、属性和漏斗](#目标属性和漏斗)
- [项目结构](#项目结构)
- [环境变量](#环境变量)
- [许可证](#许可证)

更细的文件地图见 [TOC.md](./TOC.md)。

## 特性

- **轻量脚本** — `/js/script.js` 自动报 pageview，兼容 SPA；可跟自定义事件、外链和文件下载
- **单页看板** — 访客、访问、浏览、来源、页面、地区、设备、实时
- **转化** — 目标、自定义属性、漏斗
- **分享** — 公开站点或分享链接
- **账号** — 邮箱密码、TOTP、Passkey，中英文和浅色/深色
- **站点监控** — HTTP 可达、响应时间、证书到期
- **服务器监控** — 自己的 `litestats-agent`，CPU / 内存 / 磁盘 / 流量，不是第三方探针

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) ≥ 1.4 |
| 应用 | TanStack Start + React + Vite + Tailwind 4 |
| 关系库 | PostgreSQL |
| 事件库 | ClickHouse |
| 探针 | POSIX shell + 可选 Go |

首次启动会自动建表，不依赖旧项目的 schema。

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

默认开发地址是 [http://127.0.0.1:3100](http://127.0.0.1:3100)。本地会准备账号 `demo@litestats.dev` / `12345678`，上线后立刻改掉。

如果本机已经有 Postgres / ClickHouse，改 `DATABASE_URL` 和 `CLICKHOUSE_URL` 即可，不必起 compose。

## 嵌入追踪脚本

站点创建后，把下面这段放到网站 `</head>` 前：

```html
<script defer data-domain="example.com" src="https://你的域名/js/script.js"></script>
```

自定义事件：

```js
litestats.track("Signup", { plan: "pro" })
```

## 服务器探针

在「服务器」里添加一台机器后，到目标主机执行控制台给出的命令，形如：

```bash
curl -fsSL https://你的域名/install.sh | sudo sh -s -- \
  --url https://你的域名 \
  --id SERVER_ID \
  --secret SERVER_SECRET
```

脚本会安装 `litestats-agent`，向 `POST /api/monitor/update` 上报。卸载：

```bash
curl -fsSL https://你的域名/install.sh | sudo sh -s -- uninstall
```

不要用第三方 cfsm-agent。

## 目标、属性和漏斗

- **目标**：把「成功」定义成事件名（如 `Signup`）或页面路径（如 `/thank-you`）
- **属性**：挂在事件上的键值，用来拆同一转化的内部差异
- **漏斗**：把至少两个目标按顺序串起来，看每一步掉了多少人（24 小时窗口）

在站点设置里配置，看板上的「目标 / 属性 / 漏斗」才会有业务含义。

## 项目结构

```
LiteStats/
├── app/                 # 网站、API、采集、看板
│   ├── public/          # 国旗、系统图标、探针安装脚本
│   └── src/
│       ├── routes/      # 页面与 /api/*
│       ├── components/
│       └── lib/         # Postgres、ClickHouse、会话、监控
├── agent/               # 探针源码（install.sh / litestats-agent.sh）
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
| `GOOGLE_CLIENT_ID` 等 | 可选，Search Console 关键词 |

完整模板见 [.env.example](./.env.example)。不要提交真实 `.env`。

## 许可证

MIT，见 [LICENSE](./LICENSE)。
