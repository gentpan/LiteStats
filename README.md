<p align="center">
  <a href="https://plo.st"><img src="docs/assets/plost-logo.svg" width="240" alt="Plost"></a>
</p>
<h1 align="center">Plost Go</h1>
<p align="center">轻、快、省、美的网站访问统计，供个人自托管。</p>
<p align="center">
  <a href="https://go.dev/"><img alt="Go 1.27" src="https://img.shields.io/badge/Go-1.27-00ADD8?logo=go&logoColor=white"></a>
  <a href="https://www.sqlite.org/"><img alt="SQLite" src="https://img.shields.io/badge/SQLite-Embedded-003B57?logo=sqlite&logoColor=white"></a>
  <a href="https://react.dev/"><img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://vite.dev/"><img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-22C55E"></a>
</p>

Plost 是基于 Go + SQLite 的轻量网站访问统计工具。一个可执行文件内嵌完整界面、CSS、JavaScript、字体和追踪脚本，运行时不需要 Node、Bun、Go 工具链、Docker 或外部数据库。

## 开始使用

从源码构建需要 Go 1.27 或更新版本。仓库包含已构建的网页资源，可直接编译：

```sh
go build -trimpath -ldflags='-s -w' -o plost ./cmd/plost
./plost -listen 127.0.0.1:3101 -data ./data
```

打开 `http://127.0.0.1:3101`，创建唯一的实例管理员，然后添加网站。首次初始化完成后，公开注册永久关闭。一个管理员可以管理多个网站，也可以为不同服务器分别部署独立实例。

生产环境使用对应 Linux 架构的预编译程序，在 HTTPS 反向代理后运行：

```sh
./plost -listen 127.0.0.1:3101 -data /var/lib/plost -origin https://stats.example.com
```

`-origin` 固定管理和采集服务的实际域名，并为登录 Cookie 启用 Secure。应使用 HTTPS，不向公网暴露首次初始化中的空实例。反向代理示例见 [deploy/Caddyfile](deploy/Caddyfile)。

管理员账号和统计都保存在数据目录。程序启动时自动创建数据库，数据目录权限为 0700、数据库文件权限为 0600。替换程序升级时保持相同的 `-data` 目录，升级前从后台下载备份。

## 保留的内容

- 六项只读汇总：访客、访问次数、浏览量、每次访问浏览量、跳出率和访问时长；前三项同时绘制三条曲线，另有近 5 分钟在线人数。
- 热门页面、流量来源、国家和地区。
- 浏览器、操作系统、设备、语言与屏幕分辨率。
- 原版时间选择器、趋势缩放和访问时段热力图；按来源、页面及设备等维度筛选。
- 多站点、公开统计、可撤销的只读分享、统计 API 与 CSV 报表导出。
- 匿名近期访问记录，不展示原始 IP。
- 中文和英文、深浅色模式、四种强调色、手机界面。
- 账号密码、验证器两步验证、一次性恢复码。
- 后台创建并下载加密完整备份，上传校验、完整恢复和恢复前自动保护。

按照新的简化定位，不移植企业官网、个人博客、电商等场景模板，也不加入模板转化报表、漏斗、留存、AI SEO、搜索集成、服务器监控或站点健康检查。自定义事件、文件下载和外链点击保留轻量计数。

## 网站接入

将域名替换成自己的服务和网站，在网站的 `<head>` 中加入：

```html
<script defer data-domain="example.com" src="https://stats.example.com/script.js"></script>
```

后台的网站设置会自动生成实际地址。保留 `/js/script.js`、`/tracker.js`、`window.plost`、`window.litestats` 和 `litestats:visitor-id` 兼容。追踪脚本支持 SPA 页面切换、外链和文件下载事件。

采集会检查页面域名与站点匹配；浏览器跨域采集不携带 Cookie。匿名访客 ID 保存在被统计网站的 localStorage，服务器只保存按站点生成的 HMAC 摘要。原始 IP 不写入统计。页面只保存路径和单独的 UTM 字段，不保存整段查询参数；自定义事件属性由调用方负责避免发送敏感内容。不宣称“不使用 Cookie 就自动免除所有同意要求”。

地图沿用原版，后台可配置 Mapbox 公开 Token，无 Token 时使用内嵌备用地图。当前采集只提供国家，不采集城市或省州，相关视图为空。国家默认未知。若反向代理可信地覆盖客户端 IP 和 `CF-IPCountry`，且从本机回源，可以用 `-trust-proxy` 接受这些头。该选项只信任回环地址上的直接代理；没有启用外部 IP 查询服务，不会悄悄向第三方发送访客 IP。

## 统计口径

- **访客**：所选时段内产生 pageview 的不同匿名访客。
- **浏览量**：pageview 事件数量，重复访问会累加。
- **访问次数**：同一访客连续活动视为一次访问，超过 30 分钟无活动后重新计次。
- **在线人数**：近 5 分钟产生过事件的匿名访客，不是 WebSocket 连接数或持续心跳。
- **跳出率**：时段内仅有一个 pageview 的访问占比。
- **平均访问时长**：每次访问的最后与第一个 pageview 的时间差；没有心跳，最后一页停留不能完整测量。
- **来源及设备报表**：按不同访客计数；同一访客可能跨组，组内百分比用当前列表的分组计数之和作分母。原版界面的热门页面显示不同访客，基础报表 API 的 `pages` 字段按 pageview 计数，`ui=1` 的 `details.pageVisitors` 提供访客口径。
- **趋势对比**：与紧邻的等长前一时段比较；“昨天”按上一完整自然日比较。全部时间不做环比。
- **时区**：按每个站点配置生成日期边界，趋势分桶支持夏令时。

请求返回 202 前，事件已经在 SQLite 事务中提交。采集通过有界队列和小批次事务串行写入；队列满时返回明确的 503 `event_buffer_full`，兼容脚本的有限重试。

## 统计 API

在站点设置创建分享链接，管理员可再次查看完整链接；分享报告本身不返回凭证。凭证只能读取所属网站，不能访问账号、设置、近期活动或备份。

```sh
curl --fail-with-body 'https://stats.example.com/api/v1/stats?period=summary' \
  -H "Authorization: Bearer $PLOST_TOKEN"
```

保留原来的 `apiVersion/site/period/generatedAt/onlineWindowSeconds/data` 响应结构。支持 `summary`、`live`、`today`、`yesterday`；可选 `domain` 必须与凭证所属网站相同。每个凭证每分钟最多 60 次读取。实例内 `/docs/api` 提供说明，`/api/v1/openapi.json` 提供 OpenAPI 定义。

## 备份与恢复

打开「账号 → 备份与恢复」，输入当前账号密码和独立的备份密码。备份扩展名为 `.plostbk`，使用 scrypt 派生密钥及分块 AES-256-GCM 加密，并验证最终结束块，拒绝篡改和截断。密码不保存在备份旁，也不能找回，应与备份分别保存。

导出通过 SQLite `VACUUM INTO` 生成包含已提交 WAL 数据的一致性快照，不直接复制正在使用的数据库文件。加密按 64 KiB 分块处理，不将整个数据库加载到内存。

恢复前需要当前账号密码、备份密码和 `RESTORE` 确认。服务校验完整性、数据库版本、表结构及外键；暂停内部数据库访问，在 `data/backups/before-restore-*.db` 中保存恢复前快照，再切换新库。切换失败尝试回滚到旧快照；成功后撤销全部会话，使用备份中的账号重新登录。恢复前快照是权限受限的本地 SQLite 文件，应像生产数据库一样保护。

此版无需停止外部数据库或通过 Docker socket 换库，所以由 Go 进程内的互斥机制完成切换，不依赖原版独立的特权运维进程。

**旧版 PostgreSQL + ClickHouse 的 `.lsb` 备份不能直接恢复到 SQLite。** 本次没有读取或迁移旧实例，也没有移植旧备份加密协议。若以后迁移历史数据，应另行实现离线转换并核对指标，不覆盖原数据。原版 Passkey、旧账号/团队导入、计划备份和云存储备份尚未移植；当前可使用密码、TOTP 和手动加密完整备份。

## 原版界面与开发

界面直接复用原单人版的 CSS、图标、字体、地图和报表组件。趋势按用户要求改为三条曲线同时显示，六个汇总值保留且不做指标切换。API 文档入口位于设置侧栏，旧 `/docs/api` 地址仍可用。已删除的场景模板及业务报表不恢复。页脚采用后续更新的紧凑版本，两个 40px 图标区域相邻，Logo 与 GitHub 都为灰色，悬停白色。

修改前端时需要 Bun，完成后再编译 Go：

```sh
cd frontend
bun install --frozen-lockfile
bun run typecheck
bun run check:unused
bun run build
cd ..
go build -trimpath -ldflags='-s -w' -o plost ./cmd/plost
```

React、Vite 和 Tailwind 只用于开发构建，运行时全部由 Go 内嵌资源提供。先完成网页构建，再编译 Go。`routeTree.gen.ts` 由构建生成，不手动维护。来源清单见 [frontend/upstream-manifest.json](frontend/upstream-manifest.json)，对照方法见 [frontend/UI-PARITY.md](frontend/UI-PARITY.md)。

## 交付与资源

```sh
./build.sh
```

生成 macOS arm64、Linux amd64、Linux arm64 三个独立可执行文件，使用 `CGO_ENABLED=0`，无需目标主机安装 C 动态库或 Go 环境。源码按模块拆分维护；“单文件”指最终交付，不要求把所有源码塞进一个 `.go` 文件。

运行时仍会生成 `plost.db`、防止重复启动的 `plost.lock`，以及 SQLite 可能使用的 `plost.db-wal`、`plost.db-shm`；数据库和备份不嵌入程序。程序默认对 Go 运行时设置 64 MiB 软内存目标，并将 SQLite 页缓存限制在约 4 MiB。它不是整个进程的硬内存上限，不能当作内存占用承诺；备份密码派生和报表查询可能产生额外峰值。

单连接 SQLite 适合此个人版的简化目标；大流量、长历史报表和大量同时打开的看板需要另行压测。不能直接将 SQLite 官网中普通网站的请求量等同于访问统计服务的吞吐量。

## 验证

```sh
go test ./...
go test -race ./...
go vet ./...
cd frontend && bun run typecheck && bun run check:unused && bun run build
cd ..
./build.sh
```

Bun 只用于前端开发构建，不参与运行。测试仅创建新的临时 SQLite 文件，覆盖并发初始化、权限与 CSRF、会话主机绑定、埋点及统计口径、并发访问合并、筛选、分享权限、备份损坏与截断、完整恢复、两步验证恢复码、夏令时、原版图表数据、访客热力图、域名更改保留历史和内嵌路由资源。浏览器验收只使用 Google Chrome。

源码按 [MIT License](LICENSE) 分发，品牌和字体来自原版，字体许可随程序资源保留。
