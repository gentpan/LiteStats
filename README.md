<p align="center">
  <img src="./app/public/favicon.svg" width="96" height="96" alt="LiteStats Logo">
</p>

<h1 align="center">LiteStats</h1>

<p align="center">
  <strong>简单、美观、可自托管的网站统计。</strong><br>
  无 Cookie 采集，数据由自己掌握，面向单人自托管。
</p>

<p align="center">
  <a href="https://github.com/gentpan/LiteStats/commits"><img src="https://img.shields.io/github/last-commit/gentpan/LiteStats?style=flat-square" alt="Last commit"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/gentpan/LiteStats?style=flat-square&color=4f46e5" alt="License"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.4%2B-000000?logo=bun&logoColor=white&style=flat-square" alt="Bun 1.4+"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white&style=flat-square" alt="Node.js 22"></a>
  <a href="./deploy/README.md"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker Ready"></a>
</p>

## 功能

- **访问分析**：访客、访问次数、浏览量、跳出率、访问时长与趋势对比。
- **流量洞察**：来源、页面、地区、浏览器、系统、设备、语言与访客地图。
- **实时与事件**：实时访客、活动日志、自定义事件，支持 SPA、外链和下载统计。
- **多站点管理**：站点权限、公开统计、分享链接及只读统计 API。
- **扩展能力**：搜索关键词、CSV 导入、可选 AI SEO 建议、域名/证书到期与 HTTP 检查。
- **安全与备份**：TOTP、Passkey，以及 PostgreSQL + ClickHouse 完整备份和恢复。

界面支持中文、英文、移动端和深浅色模式。

## Docker 部署

需要 Docker、Docker Compose 和 Python 3：

```bash
git clone https://github.com/gentpan/LiteStats.git
cd LiteStats
python3 deploy/litestats.py install --directory /opt/litestats-instance --port 3100
```

首次访问时创建唯一实例管理员，完成后关闭公开注册。升级、备份与恢复见[部署文档](./deploy/OPERATIONS.md)。

## 本地开发

需要 Bun 1.4+ 和 Docker Compose：

```bash
cp .env.example app/.env
docker compose up -d
cd app
bun install --frozen-lockfile
bun run dev
```

在 `app/.env` 中设置至少 32 字符的随机 `SESSION_KEY`，然后打开 `http://127.0.0.1:3100`。

## 接入网站

将以下代码放入网站的 `<head>`，替换统计服务地址和域名：

```html
<script defer data-domain="example.com" src="https://stats.example.com/script.js"></script>
```

自定义事件：

```js
window.litestats?.track("Signup", { plan: "pro" })
```

## 统计 API

创建站点分享凭证后，即可读取在线、今日和昨日统计：

```bash
curl --fail-with-body 'https://stats.example.com/api/v1/stats?period=summary' \
  -H "Authorization: Bearer $LITESTATS_TOKEN"
```

实例内 `/docs/api` 提供完整文档，`/api/v1/openapi.json` 提供 OpenAPI 3.1 规范。

## 技术栈

TanStack Start · React 19 · TypeScript · Vite · Tailwind CSS · PostgreSQL · ClickHouse

## 文档与许可

[部署参考](./deploy/README.md) · [Umami 迁移](./deploy/UMAMI-MIGRATION.md) · [文件索引](./TOC.md)

由 [gentpan](https://github.com/gentpan) 维护，基于 [MIT License](./LICENSE) 开源。
