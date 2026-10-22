# LiteStats 目录

仓库地图。用法和安装步骤看 [README](./README.md)。

## 文档

| 文件 | 内容 |
|------|------|
| [README.md](./README.md) | 介绍、快速开始、访问统计与追踪脚本 |
| [LICENSE](./LICENSE) | MIT |
| [.env.example](./.env.example) | 环境变量模板 |
| [docker-compose.yml](./docker-compose.yml) | 本地 PostgreSQL + ClickHouse |

## 应用 `app/`

主程序：TanStack Start，页面和 API 都在这里。

```
app/
├── package.json
├── vite.config.ts
├── server/plugins/site-checks.ts # 无需访问页面的后台定时检查
├── public/
│   ├── flags/                 # 地图与矩形国旗共用资源
│   └── images/flags/          # 方形国旗及一份不同的矩形图稿
└── src/
    ├── router.tsx
    ├── styles/app.css
    ├── components/            # 壳层、共用 AnalyticsDashboard、访客与设置
    ├── lib/
    │   ├── db.ts              # Postgres，首次启动建表
    │   ├── ch.ts              # ClickHouse 事件与访问统计
    │   ├── site-check*.ts      # 公网请求、到期查询、任务、权限与展示规则
    │   ├── mapbox-*.ts        # 公开 Token 配置、权限、加密和国家聚合
    │   ├── session.ts         # 登录态
    │   └── i18n.tsx           # 中 / 英
    └── routes/
        ├── index.tsx          # 站点列表
        ├── sites/             # 看板与站点设置
        ├── account.tsx        # 账户
        ├── backup.tsx         # 备份
        ├── login.tsx / register.tsx
        ├── js/script[.]js.ts  # 追踪脚本
        └── api/event.ts       # 采集
```

## 主要路由

| 路径 | 作用 |
|------|------|
| `/` | 站点列表 |
| `/sites/:domain` | 访问统计看板 |
| `/sites/:domain/health` | 域名/证书到期及 HTTP 200 检查 |
| `/sites/:domain/settings` | 常规、可见性、脚本及采集文档、搜索集成 |
| `/account` | 账户与系统设置 |
| `/account?tab=system/mapbox` | 管理员配置 Mapbox 访客地图 |
| `/backup` | 兼容跳转到账户中的备份设置 |
| `/script.js`、`/js/script.js`、`/tracker.js` | 同一追踪脚本 |
| `POST /api/event` | 事件采集 |

## 数据

- **PostgreSQL**：用户、权限归属、站点、分享、设置与独立站点检查记录；历史团队、目标、漏斗及退役配置表保留
- **ClickHouse `events_v2`**：pageview 与自定义事件

访客采集不种 Cookie。访客 ID 由服务端根据请求特征哈希，不存原始 IP；管理后台登录使用会话 Cookie。
