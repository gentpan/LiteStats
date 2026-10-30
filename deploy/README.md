# 部署 Plost

推荐使用安装器管理 Docker Compose 实例。应用、PostgreSQL 和 ClickHouse 由安装器统一构建和启动，数据库不向公网开放。

## Docker Compose 安装

需要 Linux、systemd、root 权限、Git、Docker Engine、Docker Compose v2、Python 3.9+ 和 OpenSSL。

```sh
git clone https://github.com/gentpan/Plost.git
cd Plost
python3 deploy/plost.py install --directory /opt/plost-instance --port 3100
```

应用监听 `127.0.0.1:3100`。将自己的统计域名通过 HTTPS 反向代理指向该地址，然后访问实例，创建管理员账号。初始化完成后关闭公开注册。

升级时在更新后的源码目录中运行同一安装命令，使用原实例目录和端口。备份、校验与恢复步骤见 [OPERATIONS.md](./OPERATIONS.md)。

根目录的 `docker-compose.yml` 供本地开发使用；生产安装使用 `deploy/` 中的配置。

## HTTPS 反向代理

以 Caddy 为例，将域名替换为自己的实例域名：

```caddyfile
stats.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3100
}
```

[完整 Caddy 示例](./Caddyfile) 还包含地图资源的压缩配置。使用已有代理时只添加本实例的站点配置，验证后重新加载代理。

## 后台备份与恢复

进入「设置 → 系统设置 → 备份」，可以创建和下载完整加密备份、下载恢复密钥、上传备份、校验和恢复。

恢复前会自动保存当前实例，恢复后保留旧数据库。请将恢复密钥与备份分别保管，并在服务器之外保存副本。详见[后台操作流程](./OPERATIONS.md#administrator-dashboard)。

## 原生部署参考

也可以自行维护 Node.js、PostgreSQL、ClickHouse 和 systemd 服务。以下路径和服务名均为可自定义的示例；已有实例继续使用实际配置。

### 构建应用

构建和测试需要 Bun 1.4+、Node.js 和 OpenSSL。在 `app/` 中执行：

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run check:unused
bun run build
```

将 `.output/` 的完整内容发布到一个新的版本目录。发布目录应包含 `start.mjs`、`reflect.cjs`、`server/` 和 `public/`。运行时使用 Node.js 22+，入口为 `node start.mjs`；不要直接启动 `server/index.mjs`。

### 运行配置

| 项目 | 示例 |
| --- | --- |
| 应用服务 | `plost.service` |
| 当前版本 | `/opt/plost/current` 指向 `releases/<release-id>` |
| 运行配置 | `/etc/plost/app.env`，由 systemd 的 `EnvironmentFile` 加载 |
| 应用监听 | `HOST=127.0.0.1`、`PORT=3100` |
| 数据库 | 独立的 PostgreSQL 数据库与角色，以及私有 ClickHouse 服务 |
| HTTPS | 反向代理到应用监听地址 |

以专用非特权账号运行应用。设置 `NODE_ENV=production`、`SEED_DEMO=false`、独立数据库凭据，以及至少 32 字符的随机 `SESSION_KEY`。运行配置文件权限应为 `0600`；升级时保留已有配置和密钥。

PostgreSQL 和 ClickHouse 应只对应用及运维环境开放。根据实际负载设置 ClickHouse 内存、文件句柄和数据目录权限。

网页中的完整备份与恢复需要独立运维进程。原生部署的权限与运维要求见 [OPERATIONS.md](./OPERATIONS.md#native-systemd-deployment)。

### 更新与回退

更新前备份两个数据库和运行配置，将新构建发布到独立版本目录，再切换 `current` 链接并重启应用。不要覆盖正在运行的版本目录。

保留前一版本和链接目标，便于切回。代码回退不会撤销数据库结构变化；涉及数据库版本或结构变更时，先验证兼容性和恢复方案。

### 验证部署

```sh
systemctl is-active plost.service
curl --fail --max-time 10 http://127.0.0.1:3100/api/health
curl --fail --max-time 10 http://127.0.0.1:8123/ping
```

按实际服务名和端口调整命令，并检查实例的 HTTPS 地址。最后在一个已接入的网站产生受控访问，确认后台出现新事件。

## 地区识别

`GEOIP_PROVIDER=off` 为默认设置。需要外部地区识别时，可设置 `GEOIP_PROVIDER=cnip`；应用会向 api.cnip.io 发送访客公网 IP 进行查询，原始 IP 不写入统计事件。请根据自己的隐私要求选择是否启用。

地区和城市名称使用随应用分发的翻译数据，来源与生成方式见[城市数据说明](../app/src/assets/city-names-SOURCE.md)。
