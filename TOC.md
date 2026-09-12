# LiteStats 目录

仓库地图。用法和安装步骤看 [README](./README.md)。

## 文档

| 文件 | 内容 |
|------|------|
| [README.md](./README.md) | 介绍、快速开始、追踪脚本、探针 |
| [LICENSE](./LICENSE) | MIT |
| [.env.example](./.env.example) | 环境变量模板 |
| [docker-compose.yml](./docker-compose.yml) | 本地 PostgreSQL + ClickHouse |

## 应用 `app/`

主程序：TanStack Start，页面和 API 都在这里。

```
app/
├── package.json
├── vite.config.ts
├── public/
│   ├── flags/                 # 语言切换等用的国旗
│   ├── images/flags/          # 看板地区分布
│   ├── os-icons/              # 服务器系统图标
│   ├── install.sh             # 探针安装入口
│   └── litestats-agent.sh     # 探针本体
└── src/
    ├── router.tsx
    ├── styles/app.css
    ├── components/            # 壳层、看板、服务器卡片、设置
    ├── lib/
    │   ├── db.ts              # Postgres，首次启动建表
    │   ├── ch.ts              # ClickHouse 事件与漏斗
    │   ├── session.ts         # 登录态
    │   ├── i18n.tsx           # 中 / 英
    │   ├── monitor.ts         # 服务器监控
    │   └── site-monitor.ts    # 站点 Uptime / SSL
    └── routes/
        ├── index.tsx          # 站点列表
        ├── sites/             # 看板与站点设置
        ├── servers.tsx        # 服务器列表
        ├── servers.$id.tsx    # 服务器详情
        ├── account.tsx        # 账户
        ├── backup.tsx         # 备份
        ├── login.tsx / register.tsx
        ├── js/script[.]js.ts  # 追踪脚本
        ├── api/event.ts       # 采集
        └── api/monitor/update.ts
```

## 探针 `agent/`

| 文件 | 内容 |
|------|------|
| [install.sh](./agent/install.sh) | systemd / OpenRC 安装 |
| [litestats-agent.sh](./agent/litestats-agent.sh) | 采集与上报 |
| [main.go](./agent/main.go) | 同功能的 Go 实现（可选） |

站点上的安装命令走 `app/public/` 里的副本，改探针时两处一起改。

## 主要路由

| 路径 | 作用 |
|------|------|
| `/` | 站点列表 |
| `/sites/:domain` | 访问统计看板 |
| `/sites/:domain/settings` | 目标、漏斗、属性、分享 |
| `/servers` | 服务器列表 |
| `/servers/:id` | 服务器详情 |
| `/account` | 账户与团队 |
| `/backup` | 备份到对象存储 |
| `/js/script.js` | 追踪脚本 |
| `POST /api/event` | 事件采集 |
| `POST /api/monitor/update` | 探针上报 |

## 数据

- **PostgreSQL**：用户、团队、站点、目标、漏斗、分享链接、服务器元数据、站点监控
- **ClickHouse `events_v2`**：pageview 与自定义事件

都不种 Cookie。访客 ID 由服务端根据请求特征哈希，不存原始 IP。
