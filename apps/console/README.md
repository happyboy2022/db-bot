# SQL Ops Console

SQL 执行管理后台系统，用于提交、审批和执行 SQL 请求。

## 功能特性

- **SQL 请求管理** - 创建、编辑、审批 SQL 请求
- **用户认证** - 基于 Better Auth 的用户注册和登录
- **权限控制** - PENDING/USER/ADMIN 三级角色系统
- **审计日志** - 所有操作可追溯
- **多集群支持** - 支持多个 Executor 集群的管理

## 技术栈

- **框架**: Next.js 14+ (App Router)
- **运行时**: Bun
- **ORM**: Drizzle ORM
- **数据库**: Neon (Vercel Postgres)
- **认证**: Better Auth
- **UI**: Tailwind CSS + shadcn/ui
- **部署**: Vercel

## 快速开始

### 前置条件

- [Bun](https://bun.sh/) >= 1.0
- [Doppler CLI](https://docs.doppler.com/docs/cli) (推荐)

### 安装依赖

```bash
bun install
```

### 配置环境变量

**方式一：使用 Doppler（推荐）**

```bash
# 登录 Doppler
doppler login

# 设置项目
doppler setup
# 选择: Project = db-bot-console, Config = dev
```

**方式二：手动配置**

```bash
cp .env.example .env.local
# 编辑 .env.local 填入实际值
```

### 启动开发服务器

```bash
# 使用 Doppler
doppler run -- bun run dev

# 或不使用 Doppler
bun run dev
```

访问 http://localhost:3000

### 创建管理员账户

```bash
doppler run -- bun run db:seed
```

默认管理员：
- 邮箱: `admin@localhost.dev`
- 密码: `admin123456`

## 开发命令

```bash
# 开发
bun run dev              # 启动开发服务器 (端口 3000)

# 构建
bun run build            # 构建生产版本
bun run start            # 启动生产服务器

# 代码质量
bun run lint             # ESLint 检查
bun run typecheck        # TypeScript 类型检查

# 数据库
bun run db:generate      # 生成迁移文件
bun run db:migrate       # 应用迁移
bun run db:studio        # 打开 Drizzle Studio
bun run db:seed          # 创建管理员账户
```

## 项目结构

```
src/
├── app/                          # App Router 页面
│   ├── (auth)/                   # 认证相关页面
│   ├── (dashboard)/              # 主后台
│   │   ├── admin/               # 管理功能
│   │   ├── dashboard/           # 仪表盘
│   │   └── requests/            # 请求管理
│   └── api/                      # API 路由
├── components/                   # React 组件
│   ├── admin/                   # 管理组件
│   ├── layout/                  # 布局组件
│   ├── requests/                # 请求相关组件
│   ├── shared/                  # 共享组件
│   └── ui/                      # shadcn/ui 组件
├── lib/                          # 工具库
│   ├── auth/                    # 认证相关
│   ├── contexts/                # React Context
│   ├── execution/               # SQL 执行逻辑
│   ├── executor/                # Executor API 客户端
│   ├── queries/                 # 数据库查询
│   └── utils.ts                 # 工具函数
├── db/                           # 数据库层
│   ├── schema/                  # Drizzle schema
│   └── index.ts                 # 数据库连接
└── middleware.ts                 # Next.js 中间件
```

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `DATABASE_URL` | Neon 数据库连接字符串 | ✅ |
| `BETTER_AUTH_SECRET` | Better Auth 会话签名密钥 | ✅ |
| `NEXT_PUBLIC_APP_URL` | Console URL | ✅ |
| `EXECUTOR_BASE_URL` | Executor 服务 URL | ✅ |
| `EXECUTOR_SIGNING_SECRET` | Executor HMAC 签名密钥 | ✅ |
| `CLUSTER_DOPPLER_TOKEN_*` | 各集群的 Doppler Token | ❌ |

## 核心概念

### 角色权限

| 角色 | 权限 |
|------|------|
| `PENDING` | 无法进入后台，等待激活 |
| `USER` | 创建请求、查看自己的请求 |
| `ADMIN` | 审批、执行、用户管理、会话管理、审计查看 |

### 请求状态流转

```
PENDING_APPROVAL → APPROVED → EXECUTING → SUCCEEDED
                 ↘          ↘
          REJECTED    FAILED / TERMINATED
                 ↓
     CHANGES_REQUESTED → (修改后重新提交)
                 ↓
     APPROVAL_EXPIRED (24h 过期)
```

### SQL 校验规则

**允许的语句类型：**
- SELECT
- UPDATE（必须有 WHERE）
- DELETE（必须有 WHERE）

**禁止的语句类型：**
- DDL：CREATE, ALTER, DROP, TRUNCATE
- 权限：GRANT, REVOKE
- 其他：SET, CALL, DELIMITER

## 数据库迁移

**重要：禁止手动编写迁移 SQL，禁止使用 `db-push`**

```bash
# 1. 修改 src/db/schema/ 下的 schema 文件
# 2. 生成迁移
bun run db:generate

# 3. 提交迁移文件到 Git
# 4. CI 自动应用迁移
```

## 相关文档

- [CLAUDE.md](./CLAUDE.md) - 详细开发指南
- [项目根目录 CLAUDE.md](../../CLAUDE.md) - 整体项目配置
