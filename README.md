<p align="center">
  <img src="./app/public/favicon.svg" width="96" height="96" alt="Plost Logo">
</p>

<h1 align="center">Plost</h1>

<p align="center">
  <strong>简单、美观、可自托管的网站统计。</strong><br>
  无 Cookie 采集，数据由自己掌握，面向单人自托管。
</p>

<p align="center">
  <a href="https://github.com/gentpan/Plost/commits"><img src="https://img.shields.io/github/last-commit/gentpan/Plost?style=flat-square" alt="Last commit"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/gentpan/Plost?style=flat-square&color=4f46e5" alt="License"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.4%2B-000000?logo=bun&logoColor=white&style=flat-square" alt="Bun 1.4+"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-26-339933?logo=nodedotjs&logoColor=white&style=flat-square" alt="Node.js 26"></a>
  <a href="./deploy/README.md"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker Ready"></a>
</p>

官网：[plo.st](https://plo.st) · 托管版后台：[app.plost.io](https://app.plost.io) · 托管版埋点脚本与采集入口：`stats.plost.io`。

本仓库为 Plost 单人自托管版。下文部署、埋点与 API 示例均面向你自己的实例；`stats.example.com` 应替换为该实例的实际域名。

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
git clone https://github.com/gentpan/Plost.git
cd Plost
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

将以下代码放入网站的 `<head>`，把 `stats.example.com` 替换为自己的统计服务地址，把 `example.com` 替换为被统计的网站域名：

```html
<script defer data-domain="example.com" src="https://stats.example.com/script.js"></script>
```

自定义事件：

```js
window.plost?.track("Signup", { plan: "pro" })
```

## 统计 API

在自己的实例创建站点分享凭证后，即可读取在线、今日和昨日统计：

```bash
curl --fail-with-body 'https://stats.example.com/api/v1/stats?period=summary' \
  -H "Authorization: Bearer $PLOST_TOKEN"
```

实例内 `/docs/api` 提供完整文档，`/api/v1/openapi.json` 提供 OpenAPI 3.1 规范。

## 技术栈

TanStack Start · React 19 · TypeScript · Vite · Tailwind CSS · PostgreSQL · ClickHouse

## 品牌与兼容

Plost 原名 LiteStats，使用方圆 O 标识。对外名称、仓库链接与新事件入口使用 Plost；旧 `window.litestats.track()` 继续兼容。

数据库、Cookie、访客 ID、加密与备份协议、服务名、部署脚本及运行配置保留已有内部标识，已有实例无需因改名重新初始化。自托管实例的埋点与采集地址按实际域名生成。

更换实例域名时，需更新被统计网站的埋点地址与 Google OAuth 回调；旧域名注册的 Passkey 需在新域名重新注册，可先使用原密码登录。

## 文档与许可

[部署参考](./deploy/README.md) · [Umami 迁移](./deploy/UMAMI-MIGRATION.md) · [文件索引](./TOC.md)

由 [gentpan](https://github.com/gentpan) 维护，基于 [MIT License](./LICENSE) 开源。
