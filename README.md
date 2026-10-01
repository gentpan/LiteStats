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

- **轻量脚本** — `/script.js` 自动报 pageview，兼容 SPA；可跟自定义事件、外链和文件下载
- **单页看板** — 访客、访问、浏览、来源、页面、地区、设备、实时
- **转化** — 目标、自定义属性、漏斗
- **分享** — 公开站点或分享链接
- **账号** — 邮箱密码、TOTP、Passkey，中英文和浅色/深色
- **站点监控** — HTTP 可达、响应时间、证书到期
- **服务器监控** — 内置 `litestats-agent`，采集 CPU / 内存 / 磁盘 / 流量

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) ≥ 1.4 |
| 应用 | TanStack Start + React + Vite + Tailwind 4 |
| 关系库 | PostgreSQL |
| 事件库 | ClickHouse |
| 探针 | POSIX shell + 可选 Go |

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

生产需要设置至少 32 位随机 `SESSION_KEY`。`ADMIN_EMAILS` 指定已验证邮箱的实例管理员，服务器和全局备份只允许实例管理员访问。普通注册不会自动验证邮箱。团队创建、邀请和成员管理已移除；现有站点归属记录仅用于兼容历史数据和访问权限。尚未配置邮件验证服务的生产管理员，应通过受信任的数据库管理流程确认其邮箱所有权。

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

### 三网监控

服务器详情页提供电信、联通、移动的独立延迟、丢包率及历史趋势，沿用系统历史范围（最长 7 天）。探测方向为服务器到代表节点，不是国内三网探测点对服务器的反向拨测。

- 本机每分钟执行一轮，每个节点发送 3 个 ICMP 包；远程探针随采集周期执行。各节点显示具体目标 IP。
- `ping_ct` / `ping_cu` / `ping_cm` 为成功回包的平均延迟（毫秒）；对应 `_loss` 为丢包百分比，`_status` 区分正常、超时、探测不可用；`ping_checked_at` 为探测时间。
- 新安装默认启用；旧探针需从服务器列表打开“安装命令”，重新执行以更新。Shell 安装和探针支持 `--no-ping`，Go 探针支持 `--ping=false`。
- 运行环境需提供 `ping` 命令和 ICMP 权限。无命令或权限时显示“探测不可用”，不填入假延迟。超时表示该目标未返回 ICMP，不等同于整个运营商不可用。
- `cd app && bun --env-file=.env.local scripts/carrier-test.ts` 可验证远程探针到历史查询的完整链路（仅允许隔离测试数据库，使用受控回包样本并清理测试服务器）。


### 统一设置入口

页头“设置”进入 `/account`，左侧按权限分组：

- 账号设置：个人资料、安全、个人 API 密钥、账号删除。
- 系统设置（实例管理员）：服务与 API 配置索引、SMTP 邮件、Telegram、备份与恢复。旧 `/backup` 自动进入 `/account?tab=system/backup`。
- 站点设置：地图 Key/Token、Google/Bing 搜索集成等按站点保存；系统服务索引提供直达链接。

SMTP 填写服务器、端口、TLS/STARTTLS、用户名、密码或授权码、发件地址与名称。常用 587 + STARTTLS、465 + TLS，遵循服务商说明。检查连接只验证连接/认证，不验证发件地址投递权限。当前支持公网 SMTP 服务器。

Telegram 填写 BotFather 提供的 Bot Token 和目标 Chat ID。连接检查使用 `getMe`、`getChat`，不会调用 `sendMessage`。私聊需先向机器人发送 `/start`，群组需先加入机器人。参考 [Telegram 官方说明](https://core.telegram.org/bots/tutorial) 和 [SMTP 说明](https://nodemailer.com/smtp)。

新通道配置以 AES-256-GCM 加密保存，不向浏览器回显原始密码/Token；留空保留、清除按钮显式删除。备份恢复到另一实例时必须保留同一 `SESSION_KEY` 才能解密。保存和连接检查不会启用自动告警或定时邮件报告，这些投递任务尚未接入。个人 API 密钥管理仍不代表业务 API 已接入。

验证：`cd app && bun --env-file=.env.local scripts/channels-test.ts` 在本地隔离 PostgreSQL 上创建临时数据库，检查存储/加密/掩码/保留/清除，最后删除临时数据库，不触碰当前配置或发送消息。
