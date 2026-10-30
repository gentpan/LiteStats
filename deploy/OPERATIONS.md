# Plost 安装、备份与恢复

本指南适用于单台主机上的自托管实例。PostgreSQL 保存账号、站点与配置，ClickHouse 保存统计事件。完整备份与恢复需要协调两边的数据，运行期间保持单个应用进程。

## 安装与升级

需要 Linux、systemd、root 权限、Docker Engine、Docker Compose v2、Python 3.9+ 和 OpenSSL。从 Plost 源码目录执行：

```sh
python3 deploy/plost.py install --directory /opt/plost-instance --port 3100
```

实例目录必须位于源码目录之外。安装器为新实例生成数据库密码、会话密钥和 `backup.key`，构建应用并等待数据库及应用健康检查通过。宿主机无需安装 Bun 或 Node.js。

应用仅发布本机回环端口；配置 HTTPS 反向代理后访问实例，创建管理员账号。

升级时获取源码更新，使用原实例目录和端口再次执行安装命令。已有配置和数据卷会保留。健康实例升级前会创建加密恢复备份；同一 UTC 日的后续升级复用当天的升级备份。手动备份和恢复前的保护备份不受此限制。

如果新应用启动失败，安装器恢复原镜像配置。此操作不会回退 PostgreSQL 或 ClickHouse 镜像升级；数据库大版本升级应另行验证。生产配置使用 PostgreSQL 16 和 ClickHouse 26.8 LTS。

不要对需要保留的数据卷执行 `docker compose down -v`。源码构建使用白名单，运行配置、密钥、备份和本地依赖不进入应用镜像。

<a id="administrator-dashboard"></a>

## 后台备份与恢复

进入「设置 → 系统设置 → 备份」（`/account?tab=system/backup`），使用完整备份与恢复面板：

1. 创建完整备份，将 PostgreSQL、ClickHouse 和运行配置保存为加密 `.lsb` 文件，然后下载。
2. 输入当前管理员密码，下载恢复密钥，并与备份分开保存。
3. 在目标实例初始化管理员，上传备份。来自其他实例的备份还需要上传原恢复密钥。
4. 校验备份，查看账号、站点和事件数量。校验本身不会停止应用。
5. 输入目标实例当前管理员密码和 `RESTORE`，开始恢复。系统先备份当前实例，再恢复到新数据库、核对数量、切换连接并检查应用健康状态。

恢复后使用备份中的账号和密码重新登录。原数据库保留供核验和回退。

完整备份和恢复期间应用会短暂停止。独立运维进程负责跨重启继续任务，重新加载同一页面可以继续查看进度。上传文件大小上限为 10 GiB。

### 运维进程与权限

Linux 安装器自动配置 systemd 运维进程，通过私有 Unix socket 接受经过认证的备份和恢复请求。网页容器仅挂载通信目录，不持有 Docker socket、主机运维凭据、恢复密钥或备份目录，也不开启公共运维端口。

原生部署需要自行配置同一运维进程，固定应用服务、运行配置及备份路径。数据库管理凭据只放在运维进程的私有配置中。网页应用保持日常业务所需权限。

<a id="unified-encrypted-backup"></a>

## 命令行完整备份

```sh
python3 /opt/plost-instance/plost.py backup \
  --config /opt/plost-instance/.env \
  --compose-file /opt/plost-instance/compose.yml
```

命令暂停应用，等待已接收事件写入，导出两个数据库，再启动应用并检查健康状态。数据库服务保持运行。备份期间的访问请求可能失败。

默认文件位置为 `backups/<UTC timestamp>.lsb`。指定路径时使用 `--archive /opt/plost-instance/backups/my-backup.lsb`；已有文件不会被覆盖。

完整备份包含 PostgreSQL 的结构和数据、支持的 ClickHouse 事件表、运行配置及校验清单。ClickHouse 支持 MergeTree 和 Log 系列表引擎，其他引擎会明确报错。

文件使用 AES-256-CBC/PBKDF2 加密，并通过独立派生密钥的 HMAC-SHA256 验证真实性。解密和提取之前先校验认证信息，提取后再核对文件校验和。

将备份复制到服务器之外。`backup.key` 不包含在备份中，必须单独保存；丢失密钥后无法解密备份。保留备份对应的应用版本，不要将备份或密钥提交到 Git。

## 命令行校验与恢复

```sh
python3 /opt/plost-instance/plost.py verify \
  --config /opt/plost-instance/.env \
  --archive /opt/plost-instance/backups/my-backup.lsb

python3 /opt/plost-instance/plost.py restore \
  --config /opt/plost-instance/.env \
  --compose-file /opt/plost-instance/compose.yml \
  --archive /opt/plost-instance/backups/my-backup.lsb
```

来自其他实例的备份通过 `--key-file /path/to/backup.key` 指定原密钥。使用 Compose 时，备份和密钥必须放在实例目录内，供运维容器访问。

命令行恢复前请手动创建并保存当前实例的完整备份；后台恢复会自动执行这一步。只恢复可信实例的备份，数据库转储中的结构定义可以执行 SQL。

恢复流程先校验备份真实性、文件校验和与结构，再停止应用。随后创建独立的新数据库，导入并核对每张表的行数，通过后更新数据库连接及备份中的 `SESSION_KEY`。目标实例的数据库凭据、监听地址、代理及应用镜像配置保持原值。迁移服务器后检查与域名有关的回调地址。

暂存恢复失败时，当前配置和数据库不变。切换后的应用健康检查失败时，会恢复原配置并重新连接原数据库。旧数据库、私有 `.env.before-restore` 和恢复记录均保留；失败的候选数据库也保留，确认无用后再处理。

恢复是单主机协调操作，无法提供两个数据库之间的分布式事务。使用对应或更新的应用及数据库版本，不要将新数据库大版本的备份恢复到旧版本。恢复完成后核验管理员登录、站点列表、权限和统计报表，再开放流量。

<a id="native-systemd-deployment"></a>

## 原生 systemd 部署

原生部署可直接使用源码中的工具。主机需要 Python、OpenSSL 和兼容数据库服务端版本的 PostgreSQL 客户端。以下路径、服务名和端口为示例，请按实际部署调整：

```sh
python3 /opt/plost/source/deploy/plost.py backup \
  --config /etc/plost/app.env --service plost.service \
  --health-url http://127.0.0.1:3100/api/health \
  --archive /var/backups/plost/manual-backup.lsb \
  --key-file /etc/plost/backup.key
```

将 `backup` 替换为 `verify` 或 `restore`，并指定对应备份。操作者必须能够控制所指定的服务；工具只暂停该应用服务。

原生恢复需要创建 PostgreSQL 和 ClickHouse 数据库的权限。如果应用角色权限受限，在运维进程环境或私有配置中设置 `PGADMIN_URL` 和 `CLICKHOUSE_ADMIN_URL`，由独立管理角色创建恢复数据库并授权应用角色访问。不要因此向网页应用授予广泛管理权限。

PostgreSQL 可由 root 运维进程通过 `PGADMIN_OS_USER` 使用系统用户的本地 peer 认证。XML 管理的 ClickHouse 用户通过 `CLICKHOUSE_USERS_CONFIG` 指定配置文件，只为新恢复库扩展原有精确访问白名单。修改前会保存原配置。数据库管理身份及这些设置仅供运维进程使用。

工具通过私有锁文件串行执行备份和恢复。运行配置、密钥和备份应仅允许操作者访问，凭据不要放入命令参数或日志。

## R2/S3 数据备份

后台还可以配置 R2/S3，手动或定时备份业务数据。它与完整实例备份分别管理：业务数据备份包含 PostgreSQL 行数据和事件数据，不包含主机运行配置或应用文件。

数据备份使用签名清单、压缩文件校验和与实例密钥指纹，事件分块上传，仅显示已完成的备份。恢复需要原 `SESSION_KEY` 和兼容的已初始化数据库结构。

备份与恢复期间，应用进入维护状态，等待在途请求和任务完成后刷新事件缓冲。恢复先验证所有事件分块并备份当前数据，再恢复 PostgreSQL 和切换事件表，保留原事件表。跨数据库切换若中断，可能需要使用保护备份进行人工恢复。

完整服务器迁移或灾难恢复应使用完整加密备份。安装和升级不会自动开启外部存储或定时任务；需要在后台自行配置。
