# SQL Ops Console

SQL 执行管理后台系统。

## 项目结构

- `apps/console` - 管理后台（Next.js）
- `apps/executor` - SQL 执行服务（Hono）
- `packages/shared` - 共享类型与工具

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) >= 1.0
- [Doppler CLI](https://docs.doppler.com/docs/install-cli)

### 一键设置

```bash
# 首次设置
make setup

# 启动开发服务器
make dev
```

### 手动设置

```bash
# 1. 安装依赖
make install

# 2. 配置 Doppler
doppler login
doppler setup

# 3. 运行数据库迁移
make db-migrate

# 4. 启动开发服务器
make dev
```

## 常用命令

运行 `make help` 查看所有可用命令。

### 开发

```bash
make dev              # 启动所有服务
make dev-console      # 仅启动 Console (端口 3000)
make dev-executor     # 仅启动 Executor (端口 8787)
```

### 构建与质量

```bash
make build            # 构建所有包
make lint             # 运行 linter
make typecheck        # 类型检查
make test             # 运行测试
make clean            # 清理构建产物
```

### 数据库

```bash
make db-generate      # 生成迁移文件
make db-migrate       # 应用迁移
make db-studio        # 打开 Drizzle Studio
make db-seed          # 创建开发管理员
```

## 服务地址

| 服务 | 地址 |
|------|------|
| Console | http://localhost:3000 |
| Executor | http://localhost:8787 |

## 开发指南

请阅读 [CLAUDE.md](./CLAUDE.md) 了解开发规范。

请阅读 [docs/dev/local-development.md](./docs/dev/local-development.md) 了解详细本地开发文档。

## 技术栈

| 组件 | 技术选型 |
|------|---------|
| Console 框架 | Next.js 14+ (App Router) |
| 运行时 | Bun |
| ORM | Drizzle ORM |
| 数据库 | Neon (Vercel Postgres) |
| 认证 | Better Auth |
| UI | Tailwind CSS + shadcn/ui |
| Executor 框架 | Hono |
| 目标数据库 | PolarDB MySQL |
