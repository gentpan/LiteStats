<p align="center">
  <img src="./app/public/favicon.svg" width="80" height="80" alt="Plost">
</p>

<h1 align="center">Plost</h1>

<p align="center">简单、美观、可自托管的网站统计。</p>

<p align="center">
  <a href="https://plo.st">官网</a> ·
  <a href="./deploy/OPERATIONS.md">部署文档</a> ·
  <a href="https://github.com/gentpan/Plost/issues">问题反馈</a>
</p>

Plost 帮你了解网站有多少人访问、访客从哪里来，以及他们关注哪些页面。统计采集不使用 Cookie，数据存储在你自己的服务器上。

## 功能

- **访问统计**：访客数、访问次数、浏览量、跳出率、访问时长与趋势对比。
- **流量分析**：来源、页面、国家与地区、浏览器、操作系统、设备和语言。
- **实时与事件**：实时访客、活动日志、自定义事件、外链点击和下载统计。
- **站点管理**：管理多个网站，配置公开统计、分享链接和只读统计 API。
- **网站检查**：域名到期、SSL 证书到期和 HTTP 可用性检查。
- **安全与备份**：TOTP、Passkey，以及完整实例备份、校验与恢复。

界面支持中文、英文、深浅色模式和移动端。追踪脚本支持单页应用的页面切换。

## 安装

准备一台 Linux 服务器，需要 systemd、Git、Docker Engine、Docker Compose v2、Python 3.9+ 和 OpenSSL。使用 root 权限运行安装命令：

```bash
git clone https://github.com/gentpan/Plost.git
cd Plost
python3 deploy/plost.py install --directory /opt/plost-instance --port 3100
```

安装器会构建应用、启动 PostgreSQL 和 ClickHouse，并生成运行所需的配置与密钥。实例文件保存在 `/opt/plost-instance`，无需在宿主机安装 Node.js 或 Bun。

应用默认监听 `127.0.0.1:3100`。配置 HTTPS 反向代理指向该地址后，打开你的实例域名，创建管理员账号。首次初始化完成后，公开注册关闭。

完整步骤见[部署文档](./deploy/OPERATIONS.md)。

## 接入网站

登录后台并添加网站，在站点设置中复制追踪脚本，放入被统计网站的 `<head>`：

```html
<script defer data-domain="example.com" src="https://stats.example.com/script.js"></script>
```

将 `stats.example.com` 替换为你的 Plost 实例域名，将 `example.com` 替换为要统计的网站域名。发布后访问该网站，即可在后台查看统计。

记录注册、订阅等自定义事件：

```js
window.plost?.track("Signup", { plan: "pro" })
```

## 升级与备份

在源码目录获取更新，然后再次运行安装命令：

```bash
git pull --ff-only
python3 deploy/plost.py install --directory /opt/plost-instance --port 3100
```

升级时使用原实例目录和端口。安装器会保留已有配置和数据，并在升级健康实例前保留恢复备份。

日常备份与恢复可以直接在后台的「设置 → 系统设置 → 备份」中完成：创建并下载完整备份、下载恢复密钥、上传备份、校验和恢复。恢复前会自动备份当前实例，并保留旧数据库。

请将备份与恢复密钥分别妥善保存，并保留服务器之外的副本。命令行操作见[备份与恢复文档](./deploy/OPERATIONS.md#unified-encrypted-backup)。

## 统计 API

在站点设置中创建分享链接，使用链接末尾的分享凭证作为 Bearer Token，可读取该站点的在线、今日和昨日统计：

```bash
curl --fail-with-body 'https://stats.example.com/api/v1/stats?period=summary' \
  -H "Authorization: Bearer $PLOST_TOKEN"
```

请求前将 `PLOST_TOKEN` 设为分享凭证。分享凭证可读取该站点的共享报表，请勿将它放进公开的前端代码。

你的实例中提供完整文档：`/docs/api`；OpenAPI 规范：`/api/v1/openapi.json`。

## 本地开发

需要 Bun 1.4+、Node.js、OpenSSL 和 Docker Compose。在仓库根目录执行：

```bash
cp .env.example app/.env
docker compose up -d
cd app
bun install --frozen-lockfile
```

在 `app/.env` 中设置至少 32 字符的随机 `SESSION_KEY`，然后启动开发服务：

```bash
bun run dev
```

打开 `http://127.0.0.1:3100`。根目录的 `docker-compose.yml` 用于本地开发，生产安装使用上述安装器。

提交变更前运行：

```bash
bun run typecheck
bun test
bun run check:unused
bun run build
```

## 技术栈

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square)](https://tanstack.com/start)
[![React](https://img.shields.io/badge/React-149ECA?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-FFCC01?style=flat-square&logo=clickhouse&logoColor=black)](https://clickhouse.com/)
[![Bun](https://img.shields.io/badge/Bun-14151A?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

## 许可

基于 [MIT License](./LICENSE) 开源，由 [gentpan](https://github.com/gentpan) 维护。
