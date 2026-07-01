# 生产部署指南

## 本地开发（Colima）

本项目使用 Docker Compose，推荐通过 [Colima](https://github.com/abiosoft/colima) 替代 Docker Desktop：

```bash
# 安装（如未安装）
brew install colima docker docker-compose

# 启动 Colima
colima start

# 启动 LiteStats 本地数据库
bun run db:up
```

常用命令：

```bash
colima status    # 查看状态
colima stop      # 停止虚拟机
colima start     # 启动
```

`docker compose` 与 Docker Desktop 用法相同，无需修改项目配置。

## 快速启动

```bash
cp .env.production.example .env.production
# 编辑 .env.production：域名、密钥、邮箱

bun run prod:up
```

## 架构

```
Internet → Caddy (:443 HTTPS) → app (:3000 Next.js) → PostgreSQL
```

- **Caddy**：自动申请 Let's Encrypt 证书，强制 HTTPS
- **app**：Bun 运行 Next.js standalone，启动时自动 `prisma db push`
- **postgres**：持久化数据

## Passkey 生产配置

| 变量 | 示例 | 说明 |
|------|------|------|
| `WEBAUTHN_RP_ID` | `stats.example.com` | 域名，不含协议和端口 |
| `WEBAUTHN_ORIGIN` | `https://stats.example.com` | 完整 HTTPS origin |
| `DOMAIN` | `stats.example.com` | Caddy 证书域名 |

Passkey 要求 HTTPS（localhost 除外）。配置错误会导致生物识别登录失败。

## 首次登录后

1. 使用 `admin` / `litestats` 登录（若 `RUN_DB_SEED=true`）
2. **立即修改密码**（设置 → 修改密码）
3. **注册 Passkey**（设置 → Passkey）
4. 将 `RUN_DB_SEED` 改为 `false` 并重启，避免重复 seed

## 常用命令

```bash
bun run prod:logs    # 查看应用日志
bun run prod:down    # 停止服务
curl https://你的域名/api/health
```

## 仅本地 Docker 测试（无 HTTPS）

注释 `deploy/Caddyfile` 中的域名块，启用底部 `:80` 配置，然后：

```bash
docker compose -f docker-compose.prod.yml up -d --build app postgres
# 访问 http://localhost:3000（需映射 app 端口）
```

本地 Passkey 测试请继续使用 `bun run dev` + `http://localhost:3000`。
