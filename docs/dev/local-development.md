# 本地开发指南

本文档详细介绍如何在本地搭建和运行 SQL Ops Console 开发环境。

## 目录

- [快速开始](#快速开始)
- [前置要求](#前置要求)
- [Doppler 配置](#doppler-配置)
- [环境变量](#环境变量)
- [Makefile 命令](#makefile-命令)
- [数据库管理](#数据库管理)
- [调试技巧](#调试技巧)
- [常见问题](#常见问题)

## 快速开始

```bash
# 首次设置
make setup

# 启动开发服务器
make dev
```

## 前置要求

### 必需软件

| 软件 | 最低版本 | 安装说明 |
|------|----------|----------|
| Bun | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| Make | - | macOS/Linux 自带 |
| Doppler CLI | 最新版本 | `brew install dopplerhq/cli/doppler` |

### 验证安装

```bash
bun --version
make --version
doppler --version
```

## Doppler 配置

本项目使用 **Doppler** 统一管理所有环境变量，无需手动维护 `.env` 文件。

### 什么是 Doppler？

Doppler 是一个环境变量管理平台，提供：

- **集中管理**：所有环境变量统一存储在 Doppler
- **多环境支持**：dev、stg、prd 等环境独立配置
- **自动注入**：本地开发和 CI/CD 自动获取环境变量
- **安全审计**：变更历史可追溯

### 设置步骤

#### 1. 登录 Doppler

```bash
doppler login
```

#### 2. 配置项目

```bash
# 在项目根目录执行
doppler setup
```

选择配置：
- **Project**: `db-bot-console`
- **Config**: `dev`

#### 3. 验证配置

```bash
# 查看配置状态
make doppler-status

# 列出环境变量
doppler secrets
```

### 切换环境

```bash
# 切换到开发环境
doppler configure set config dev

# 切换到预发布环境
doppler configure set config stg

# 切换到生产环境
doppler configure set config prd
```

## 环境变量

### Console (apps/console)

通过 Doppler 自动注入，无需手动配置：

| 环境变量 | 说明 |
|---------|------|
| `DATABASE_URL` | Neon 数据库连接字符串 |
| `BETTER_AUTH_SECRET` | Better Auth 会话签名密钥 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 信任的来源（CORS） |
| `NEXT_PUBLIC_APP_URL` | Console 公开 URL |
| `EXECUTOR_BASE_URL` | Executor API URL |
| `EXECUTOR_SIGNING_SECRET` | Console 与 Executor 通信的签名密钥 |

### Executor (apps/executor)

| 环境变量 | 说明 |
|---------|------|
| `CLUSTER_NAME` | 集群标识名称 |
| `PORT` | 服务端口 |
| `EXECUTOR_SIGNING_SECRET` | API 签名密钥 |
| `DATABASE_URL` | 目标 MySQL 数据库连接字符串 |

## Makefile 命令

运行 `make help` 查看所有可用命令。

### 开发命令

| 命令 | 说明 |
|------|------|
| `make setup` | 首次项目设置 |
| `make dev` | 启动所有开发服务器 |
| `make dev-console` | 仅启动 Console (端口 3000) |
| `make dev-executor` | 仅启动 Executor (端口 8787) |
| `make install` | 安装依赖 |

### 构建与质量命令

| 命令 | 说明 |
|------|------|
| `make build` | 构建所有包 |
| `make lint` | 运行 linter |
| `make typecheck` | 类型检查 |
| `make test` | 运行测试 |
| `make clean` | 清理构建产物 |

### 数据库命令

| 命令 | 说明 |
|------|------|
| `make db-generate` | 生成迁移文件 |
| `make db-migrate` | 应用迁移 |
| `make db-studio` | 打开 Drizzle Studio |
| `make db-seed` | 创建开发管理员 |

### Doppler 命令

| 命令 | 说明 |
|------|------|
| `make doppler-login` | 登录 Doppler |
| `make doppler-setup` | 配置 Doppler |
| `make doppler-status` | 查看配置状态 |

## 数据库管理

### Drizzle ORM 工作流

```bash
# 1. 修改 schema 文件
# apps/console/src/db/schema/

# 2. 生成迁移文件
make db-generate

# 3. 应用迁移
make db-migrate

# 4. 查看数据
make db-studio
```

### Schema 文件位置

```
apps/console/src/db/
├── schema/
│   ├── users.ts
│   ├── requests.ts
│   └── ...
├── index.ts
└── migrations/
```

## 调试技巧

### Console 调试

```bash
# 启动 Console 开发服务器
make dev-console

# 访问 http://localhost:3000
```

VS Code 调试配置 (`.vscode/launch.json`):

```json
{
  "configurations": [
    {
      "name": "Next.js: debug",
      "type": "node-terminal",
      "request": "launch",
      "command": "make dev-console"
    }
  ]
}
```

### Executor 调试

```bash
# 启动 Executor 开发服务器
make dev-executor

# 测试 API
curl http://localhost:8787/health
```

### API 测试

```bash
# 健康检查
curl http://localhost:8787/health

# 带认证的请求（需要签名）
# 参考 MULTI_CLUSTER_DEPLOYMENT.md 中的签名算法
```

## 常见问题

### Q: Doppler 配置失败怎么办？

确保：
1. 已安装 Doppler CLI：`doppler --version`
2. 已登录 Doppler：`doppler login`
3. 有项目访问权限：`doppler projects`

手动配置：
```bash
doppler configure set project db-bot-console
doppler configure set config dev
```

### Q: DATABASE_URL 连接失败

确保：
1. Doppler 配置正确：`doppler secrets get DATABASE_URL`
2. 密码中的特殊字符已正确编码
3. 网络可以访问 Neon 数据库

### Q: Console 与 Executor 通信失败

确保：
1. Executor 正在运行 (`make dev-executor`)
2. `EXECUTOR_BASE_URL` 设置正确
3. 两个服务使用相同的 `EXECUTOR_SIGNING_SECRET`

### Q: 端口被占用

```bash
# 查找占用端口的进程
lsof -i :3000  # Console
lsof -i :8787  # Executor

# 终止进程
kill -9 <PID>
```

### Q: 如何切换 Doppler 环境？

```bash
# 查看当前配置
make doppler-status

# 切换到其他环境
doppler configure set config stg  # 切换到 stg 环境
doppler configure set config prd  # 切换到 prd 环境
```

## 服务端口

| 服务 | 端口 |
|------|------|
| Console (Next.js) | 3000 |
| Executor (Hono) | 8787 |
