# SQL Ops Console - Claude 开发配置

## 项目概述

SQL 执行管理后台系统，包含两个核心组件：

1. **Console（管理后台）** - Next.js App Router + Neon (Vercel Postgres) + Better Auth
2. **Executor（执行服务）** - Hono + 阿里云函数计算 FC 3.0

### 核心原则

- Console **绝不直连数据库**，所有 DB 操作必须经由 Executor API
- 审计日志**只能追加**，禁止修改或删除
- 写操作（UPDATE/DELETE）必须**先预检后执行**
- 多语句**串行执行**，失败则终止后续

---

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
| 目标数据库 | PolarDB MySQL (MVP) |
| 部署 - Console | Vercel |
| 部署 - Executor | 阿里云函数计算 FC 3.0 |
| 环境变量管理 | Doppler |

---

## 目录结构

```
bogota/
├── CLAUDE.md                    # 本文件 - Claude 开发配置
├── doppler.yaml                 # Doppler 配置文件
├── docs/
│   └── REQUIREMENTS.md          # 需求文档与任务追踪
├── scripts/
│   ├── setup.ts                 # 首次设置脚本
│   ├── dev.ts                   # 开发服务器启动脚本
│   ├── sync-env.ts              # Console 环境变量同步脚本
│   ├── sync-executor-env.ts     # Executor 环境变量同步脚本
│   └── fetch-cluster-env.ts     # 集群环境变量获取工具
├── apps/
│   ├── console/                 # Next.js 管理后台
│   │   ├── src/
│   │   │   ├── app/            # App Router 页面
│   │   │   │   └── api/auth/   # Better Auth API 路由
│   │   │   ├── components/     # React 组件
│   │   │   ├── lib/            # 工具函数、认证配置
│   │   │   │   ├── auth.ts     # Better Auth 服务端配置
│   │   │   │   └── auth-client.ts # Better Auth 客户端
│   │   │   └── db/             # Drizzle schema
│   │   ├── drizzle/            # 数据库迁移
│   │   └── package.json
│   └── executor/               # Hono 执行服务
│       ├── src/
│       │   ├── routes/         # API 路由
│       │   ├── services/       # 业务逻辑
│       │   ├── validators/     # SQL 校验
│       │   └── db/             # MySQL 连接池
│       ├── s.yaml              # Serverless-devs 配置
│       └── package.json
├── packages/
│   └── shared/                 # 共享类型与工具
│       ├── types/              # TypeScript 类型定义
│       ├── validators/         # SQL 校验逻辑
│       └── constants/          # 常量定义
├── turbo.json                  # Turborepo 配置
└── package.json                # 工作区根配置
```

---

## 本地开发完整指南

本项目使用 **Doppler** 统一管理所有环境变量，实现一次配置、处处可用。

### 前置要求

| 工具 | 版本要求 | 安装方式 |
|------|---------|---------|
| Bun | 最新版本 | `curl -fsSL https://bun.sh/install \| bash` |
| Doppler CLI | 最新版本 | `brew install dopplerhq/cli/doppler` |
| Git | 2.x+ | 系统自带或 `brew install git` |

### 第一步：克隆项目

```bash
git clone <repo-url>
cd providence
```

### 第二步：首次设置

```bash
make setup
```

此命令会自动执行：
1. ✅ 检查 Bun 是否已安装
2. ✅ 检查 Doppler CLI 是否已安装
3. ✅ 安装项目依赖 (`bun install`)
4. ✅ 引导配置 Doppler（如果未配置）

### 第三步：配置 Doppler

如果是首次使用 Doppler，需要先登录：

```bash
# 1. 登录 Doppler（会打开浏览器）
doppler login

# 2. 配置项目（在项目根目录执行）
doppler setup
```

在 `doppler setup` 时选择：
- **Project**: `db-bot-console`
- **Config**: `dev`

配置成功后会生成 `.doppler.yaml` 文件（已加入 .gitignore）。

### 第四步：启动开发环境

```bash
# 启动所有服务（Console + Executor）
make dev

# 或者分别启动
make dev-console    # 仅 Console (端口 3000)
make dev-executor   # 仅 Executor (端口 8787)
```

### 第五步：创建开发管理员账户

```bash
make db-seed
```

创建的账户：
- **邮箱**: `admin@localhost.dev`
- **密码**: `admin123456`
- **角色**: `ADMIN`

### 开发命令速查

```bash
# ==================== 开发 ====================
make dev                     # 启动所有服务
make dev-console             # 仅启动 Console
make dev-executor            # 仅启动 Executor
make dev-remote CLUSTER=dev  # Console + 远程 Executor

# ==================== 构建与质量 ====================
make build                   # 构建所有包
make lint                    # 代码检查
make typecheck               # 类型检查
make test                    # 运行测试

# ==================== 数据库 ====================
make db-generate             # 生成迁移文件
make db-migrate              # 应用迁移
make db-studio               # 打开 Drizzle Studio
make db-seed                 # 创建开发管理员
make db-unseed               # 删除开发管理员

# ==================== 环境变量同步 ====================
make sync-env                # 同步 Console 环境变量到 .env.local
make sync-executor-env       # 同步 Executor 环境变量到 .env.local
make sync-all-env            # 同步 Console 和 Executor 所有环境变量

# ==================== Doppler ====================
make doppler-login           # 登录 Doppler
make doppler-setup           # 配置 Doppler
make doppler-status          # 查看配置状态
```

### 连接远程 Executor 集群

本地 Console 可以连接远程部署的 Executor 进行调试：

```bash
# 连接开发环境
make dev-remote CLUSTER=dev

# 连接预发布环境
make dev-remote CLUSTER=pre

# 连接生产集群
make dev-remote CLUSTER=us_1
make dev-remote CLUSTER=sg_1
```

### 动态端口支持

开发脚本会自动检测端口冲突并分配可用端口：

```bash
# 自动检测可用端口
make dev

# 手动指定端口
bun scripts/dev.ts --port 3001 --executor-port 8788
```

---

## 环境变量详解

本项目采用 **Doppler 统一管理**所有环境变量，实现：
- ✅ 本地开发自动注入
- ✅ GitHub Actions 自动获取
- ✅ Vercel 部署自动同步
- ✅ 无需手动维护 `.env` 文件

### Doppler 项目架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Doppler 项目结构                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  db-bot-console (Console 管理后台)                                   │
│  ├── dev   → 本地开发环境                                            │
│  ├── stg   → 预发布环境                                              │
│  └── prd   → 生产环境                                                │
│       │                                                             │
│       └── 包含各 Executor 集群的 Token:                              │
│           ├── CLUSTER_DOPPLER_TOKEN_DEV                             │
│           ├── CLUSTER_DOPPLER_TOKEN_PRE                             │
│           ├── CLUSTER_DOPPLER_TOKEN_US_1                            │
│           ├── CLUSTER_DOPPLER_TOKEN_US_2                            │
│           ├── CLUSTER_DOPPLER_TOKEN_SG_1                            │
│           └── CLUSTER_DOPPLER_TOKEN_SG_2                            │
│                                                                     │
│  db-bot-executor (Executor 执行服务)                                 │
│  ├── dev   → 开发环境                                                │
│  ├── pre   → 预发布环境                                              │
│  ├── us_1  → 美国集群 1                                              │
│  ├── us_2  → 美国集群 2                                              │
│  ├── sg_1  → 新加坡集群 1                                            │
│  └── sg_2  → 新加坡集群 2                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Console 环境变量

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `DATABASE_URL` | Neon 数据库连接字符串 | `postgresql://user:pass@host/db?sslmode=require` |
| `BETTER_AUTH_SECRET` | Better Auth 会话签名密钥（32 字节随机字符串） | `openssl rand -base64 32` 生成 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 信任的来源（CORS） | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Console 公开 URL | `http://localhost:3000`（开发时自动设置） |
| `EXECUTOR_BASE_URL` | Executor API URL | `http://localhost:8787`（开发时自动设置） |
| `EXECUTOR_SIGNING_SECRET` | Console 与 Executor 通信的签名密钥 | 与 Executor 配置相同 |
| `CLUSTER_DOPPLER_TOKEN_*` | 各 Executor 集群的 Doppler Token | 用于动态获取集群配置 |

### Executor 环境变量

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `CLUSTER_NAME` | 集群标识名称 | `dev`, `pre`, `us_1`, `sg_1` |
| `PORT` | 服务端口 | `8787` |
| `EXECUTOR_BASE_URL` | 服务公开 URL | `https://executor.example.com` |
| `EXECUTOR_SIGNING_SECRET` | API 签名密钥（与 Console 相同） | 32 字节随机字符串 |
| `DATABASE_URL` | 目标 MySQL 数据库连接字符串 | `mysql://user:pass@host:3306/db` |
| `ALICLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey ID | 用于函数计算部署 |
| `ALICLOUD_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret | 用于函数计算部署 |
| `ALICLOUD_REGION` | 阿里云区域 | `cn-shanghai`, `ap-southeast-1` |

### 环境变量安全等级

| 等级 | 变量类型 | 说明 |
|------|---------|------|
| 🔴 高敏感 | `*_SECRET`, `*_KEY`, `*_TOKEN`, `DATABASE_URL` | 绝不能提交到代码库 |
| 🟡 中敏感 | `ALICLOUD_*`, `VERCEL_*` | 仅在 CI/CD 和生产环境使用 |
| 🟢 低敏感 | `PORT`, `CLUSTER_NAME`, `*_URL` | 可在配置文件中使用 |

### 手动配置（不推荐）

如果不使用 Doppler，可以手动配置环境变量：

```bash
# 复制示例文件
cp apps/console/.env.example apps/console/.env.local
cp apps/executor/.env.example apps/executor/.env

# 编辑文件，填入实际值
```

---

## 部署完整指南

### 部署架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CI/CD 部署流程                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  GitHub Repository                                                  │
│       │                                                             │
│       │ push to main                                                │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    GitHub Actions                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │ console.yml │  │executor.yml │  │executor-multi-      │  │   │
│  │  │             │  │             │  │cluster.yml          │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │   │
│  └─────────┼────────────────┼────────────────────┼─────────────┘   │
│            │                │                    │                  │
│            ▼                ▼                    ▼                  │
│       ┌────────┐      ┌──────────┐      ┌───────────────────┐      │
│       │ Vercel │      │ Executor │      │ Executor Clusters │      │
│       │Console │      │   DEV    │      │ pre,us_1,us_2,    │      │
│       └────────┘      └──────────┘      │ sg_1,sg_2         │      │
│                                         └───────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### GitHub Secrets 配置

**只需配置 4 个 Secrets**：

| Secret | 说明 | 获取方式 |
|--------|------|---------|
| `DOPPLER_TOKEN` | Console 生产环境的 Doppler Service Token | Doppler Dashboard → db-bot-console → prd → Access → Generate Service Token |
| `VERCEL_TOKEN` | Vercel 部署 Token | Vercel Dashboard → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Vercel 组织 ID | Vercel Dashboard → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | Vercel 项目 ID | Vercel Dashboard → Project Settings → General → Project ID |

**配置步骤**：

1. 打开 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 依次添加上述 4 个 Secrets

### Doppler Token 架构

**核心设计**：只需一个 `DOPPLER_TOKEN`（Console prd），即可获取所有环境配置。

```
GitHub Secret: DOPPLER_TOKEN (Console prd 的 Service Token)
        │
        │ doppler secrets get CLUSTER_DOPPLER_TOKEN_*
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Console Doppler Config (prd)                                       │
│                                                                     │
│  ├── DATABASE_URL                 → Console 数据库                  │
│  ├── BETTER_AUTH_SECRET           → 认证密钥                        │
│  ├── EXECUTOR_SIGNING_SECRET      → API 签名密钥                    │
│  │                                                                  │
│  └── Executor 集群 Token（用于 CI/CD 间接获取）                       │
│      ├── CLUSTER_DOPPLER_TOKEN_DEV    ──► db-bot-executor/dev       │
│      ├── CLUSTER_DOPPLER_TOKEN_PRE    ──► db-bot-executor/pre       │
│      ├── CLUSTER_DOPPLER_TOKEN_US_1   ──► db-bot-executor/us_1      │
│      ├── CLUSTER_DOPPLER_TOKEN_US_2   ──► db-bot-executor/us_2      │
│      ├── CLUSTER_DOPPLER_TOKEN_SG_1   ──► db-bot-executor/sg_1      │
│      └── CLUSTER_DOPPLER_TOKEN_SG_2   ──► db-bot-executor/sg_2      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### GitHub Actions 工作流详解

| 工作流 | 文件 | 触发条件 | 部署目标 |
|--------|------|---------|---------|
| Console 部署 | `console.yml` | push to main (console 相关文件) | Vercel |
| Executor DEV | `executor.yml` | push to main (executor 相关文件) | 阿里云 FC (dev) |
| Executor 多集群 | `executor-multi-cluster.yml` | push to main / workflow_dispatch | 阿里云 FC (pre, us_1, us_2, sg_1, sg_2) |
| 数据库迁移 | `migrate.yml` | push to main (drizzle 相关文件) | Neon 数据库 |

### 手动触发部署

通过 GitHub Actions 手动触发部署：

1. 打开 GitHub 仓库 → Actions
2. 选择 "Executor Multi-Cluster Deploy"
3. 点击 "Run workflow"
4. 可选择特定集群（留空则部署所有）：
   - 部署单个集群：`us_1`
   - 部署多个集群：`us_1,sg_1`
   - 部署所有集群：留空

### 添加新 Executor 集群

**步骤 1：创建 Doppler 配置**

```bash
# 在 Doppler Dashboard 中操作
# 1. 打开 db-bot-executor 项目
# 2. 复制现有配置（如 us_1）到新配置（如 eu_1）
# 3. 修改新配置的环境变量
```

**步骤 2：配置必要的环境变量**

| 环境变量 | 说明 |
|---------|------|
| `CLUSTER_NAME` | `eu_1` |
| `ALICLOUD_REGION` | `eu-central-1`（根据实际区域） |
| `ALICLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey |
| `ALICLOUD_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| `DATABASE_URL` | 目标数据库连接字符串 |
| `EXECUTOR_SIGNING_SECRET` | 与 Console 相同的签名密钥 |

**步骤 3：生成 Service Token**

1. Doppler Dashboard → db-bot-executor → eu_1 → Access
2. Generate Service Token
3. 复制生成的 Token

**步骤 4：添加到 Console 配置**

1. Doppler Dashboard → db-bot-console → prd
2. 添加环境变量：`CLUSTER_DOPPLER_TOKEN_EU_1` = `<刚生成的 Token>`

**步骤 5：更新 GitHub Actions**

编辑 `.github/workflows/executor-multi-cluster.yml`：

```yaml
env:
  ALL_CLUSTERS: 'pre,us_1,us_2,sg_1,sg_2,eu_1'  # 添加 eu_1
```

**注意**：无需在 GitHub Secrets 中添加任何新配置，CI/CD 会通过 Console Token 自动获取。

### Vercel 部署配置

Console 部署到 Vercel，需要完成以下配置：

**1. 连接 Vercel 项目**

```bash
# 首次连接
cd apps/console
npx vercel link
```

**2. 配置 Vercel 环境变量**

在 Vercel Dashboard → Project → Settings → Environment Variables：

| 变量名 | 值 | 环境 |
|--------|---|------|
| `DOPPLER_TOKEN` | Console prd 的 Service Token | Production |

**3. 配置 Doppler 集成（推荐）**

或者使用 Doppler 官方集成自动同步环境变量：

1. Vercel Dashboard → Project → Settings → Integrations
2. 添加 Doppler 集成
3. 选择 db-bot-console 项目和 prd 配置

### 阿里云函数计算配置

Executor 部署到阿里云函数计算 FC 3.0。

**前置要求**：

1. 阿里云账号并开通函数计算服务
2. 创建 AccessKey（建议使用 RAM 子账号）
3. 授予函数计算相关权限

**在 Doppler 中配置**（每个 Executor 集群）：

| 变量名 | 说明 |
|--------|------|
| `ALICLOUD_ACCESS_KEY_ID` | RAM 用户 AccessKey ID |
| `ALICLOUD_ACCESS_KEY_SECRET` | RAM 用户 AccessKey Secret |
| `ALICLOUD_REGION` | 函数计算区域（如 `cn-shanghai`） |

### 部署故障排查

**问题：Doppler Token 获取失败**

```
Error: CLUSTER_DOPPLER_TOKEN_* not found
```

解决方案：
1. 检查 Console prd 配置中是否有对应的 `CLUSTER_DOPPLER_TOKEN_*`
2. 检查 Token 名称是否正确（大写，下划线分隔）
3. 确保 GitHub Secret `DOPPLER_TOKEN` 是 Console prd 的 Token

**问题：阿里云部署失败**

```
Error: AccessDenied
```

解决方案：
1. 检查 `ALICLOUD_ACCESS_KEY_ID` 和 `ALICLOUD_ACCESS_KEY_SECRET` 是否正确
2. 确认 RAM 用户有函数计算操作权限
3. 检查 `ALICLOUD_REGION` 是否正确

**问题：Vercel 部署失败**

解决方案：
1. 检查 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 是否正确
2. 确认 Vercel 项目已正确连接

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          开发环境                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐                      ┌─────────────┐              │
│  │   Console   │  EXECUTOR_BASE_URL   │  Executor   │              │
│  │  (Next.js)  │ ─────────────────────▶ (Hono)     │              │
│  │  port:3000  │  EXECUTOR_SIGNING    │  port:8787  │              │
│  └─────────────┘     _SECRET          └─────────────┘              │
│        │                                    │                       │
│        │ DATABASE_URL                       │ DATABASE_URL          │
│        ▼                                    ▼                       │
│  ┌─────────────┐                      ┌─────────────┐              │
│  │    Neon     │                      │   PolarDB   │              │
│  │  (Postgres) │                      │   (MySQL)   │              │
│  └─────────────┘                      └─────────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 生产环境多集群架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        生产环境 (多集群)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐                                                   │
│  │   Console   │                                                   │
│  │  (Vercel)   │                                                   │
│  └─────────────┘                                                   │
│        │                                                           │
│        ▼                                                           │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   │
│  │ Executor  │   │ Executor  │   │ Executor  │   │ Executor  │   │
│  │   SG-1    │   │   SG-2    │   │   US-1    │   │   US-2    │   │
│  └───────────┘   └───────────┘   └───────────┘   └───────────┘   │
│        │               │               │               │          │
│        └───────────────┴───────────────┴───────────────┘          │
│                              │                                     │
│                              ▼                                     │
│                 ┌─────────────────────────┐                       │
│                 │    Target Databases     │                       │
│                 │  ├── PolarDB MySQL      │                       │
│                 │  └── AnalyticDB (ADB)   │                       │
│                 └─────────────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 开发规范

### 代码风格

- 使用 TypeScript 严格模式
- 优先使用函数式组件和 React Server Components
- 使用 Zod 进行运行时类型校验
- 所有 API 请求使用 server actions 或 API routes

### 语言规范

本项目统一使用**中文**作为主要交流和文档语言。

#### Claude 交互语言

- **Claude 必须使用中文**回答问题、解释代码、提供建议
- **Git 提交信息必须使用中文**（type 和 scope 保持英文，description 使用中文）
- **文档内容必须使用中文**（包括 README、注释说明等）
- **专业术语保持英文**，例如：API、SQL、MCP、Doppler、Executor、Schema、Token 等

#### 用户界面语言

- **所有用户界面文字必须使用中文**
- 包括但不限于：按钮文字、表单标签、页面标题、描述文字、错误提示、Toast 通知

#### 代码语言

- 代码注释可以使用中文或英文
- 变量名、函数名等标识符使用英文
- 类型定义、接口名称使用英文

### 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `sql-validator.ts` |
| React 组件 | PascalCase | `RequestList.tsx` |
| 函数 | camelCase | `validateSqlStatement()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_AFFECTED_ROWS` |
| 数据库表 | snake_case | `sql_requests` |
| 数据库列 | snake_case | `created_at` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |
| Doppler Token | `CLUSTER_DOPPLER_TOKEN_{ENV}` | `CLUSTER_DOPPLER_TOKEN_SG_1` |

### Git 提交规范

```
<type>(<scope>): <中文描述>

type: feat | fix | docs | style | refactor | test | chore
scope: console | executor | shared | db | ci | doppler
```

**注意：description 必须使用中文，type 和 scope 保持英文。**

示例：
```
feat(console): 添加 SQL 请求创建表单
fix(executor): 修复连接池超时问题
docs: 更新 CLAUDE.md 开发配置
chore(doppler): 更新集群环境变量配置
refactor(shared): 重构 SQL 校验逻辑
test(console): 添加用户认证单元测试
```

### 数据库迁移规范

**重要：禁止手动编写迁移 SQL 脚本，禁止使用 `db-push`**

数据库迁移采用 **生成迁移文件 + CI 自动执行** 的方式：

1. **修改 schema 文件** - 在 `apps/console/src/db/schema/` 目录下修改相应的 TypeScript 文件
2. **生成迁移** - Claude 自动执行 `drizzle-kit generate` 生成迁移 SQL
3. **检查生成的 SQL** - 在 `apps/console/drizzle/migrations/` 目录检查生成的迁移文件
4. **提交迁移文件** - 将生成的迁移文件一起提交到 Git
5. **CI 自动应用** - GitHub Actions 会在部署时自动运行迁移

**迁移流程图：**
```
Claude 修改 schema → Claude 执行 db-generate → Claude 提交代码 → CI 自动 db-migrate
```

---

## Claude 数据库迁移规则

**⚠️ 重要：Claude 必须自动执行迁移生成，禁止要求用户手动执行**

当 Claude 修改了 `apps/console/src/db/schema/` 目录下的任何文件后，必须立即自动执行以下步骤：

### 1. 自动生成迁移

修改 schema 后，Claude 必须自动执行迁移生成命令：

```bash
cd /path/to/project/apps/console && bun drizzle-kit generate
```

### 2. 处理交互式提示

如果命令需要交互式输入（如重命名表或列），使用 `yes` 或 `echo` 管道自动确认：

```bash
# 方式一：默认选择第一个选项
echo "" | bun drizzle-kit generate

# 方式二：如果需要选择第二个选项（"rename"）
expect -c '
spawn bun drizzle-kit generate
expect "Is * created or renamed"
send "\033\[B\r"
expect eof
'
```

### 3. 验证迁移文件

生成后，Claude 应该：
1. 读取生成的迁移文件，确认 SQL 语句正确
2. 确保迁移文件已添加到 Git 暂存区
3. 如果用户要求提交，将迁移文件一起提交

---

## 关键业务规则

### SQL 校验规则

**允许的语句类型（MVP）：**
- SELECT
- UPDATE（必须有 WHERE）
- DELETE（必须有 WHERE）

**禁止的语句类型：**
- DDL：CREATE, ALTER, DROP, TRUNCATE
- 权限：GRANT, REVOKE
- 其他：SET, CALL, DELIMITER, 存储过程

### 角色权限

| 角色 | 权限 |
|------|------|
| PENDING | 无法进入后台，等待激活 |
| USER | 创建请求、查看自己的请求 |
| ADMIN | 审批、执行、用户管理、会话管理、审计查看 |

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

---

## 认证系统

本项目使用 **Better Auth** 处理用户认证。

### 架构说明

- **users 表**：存储用户基本信息（id, name, email, emailVerified）
- **sessions 表**：存储登录会话
- **accounts 表**：存储密码凭证和 OAuth 账户
- **profiles 表**：存储业务相关的用户信息（role, status, displayName）

### 认证流程

1. **注册**：用户注册后创建 users + accounts + profiles 记录，默认角色为 PENDING
2. **登录**：Better Auth 验证密码，创建 session
3. **会话管理**：中间件检查 session 有效性，页面组件检查用户角色

### 关键文件

- `lib/auth.ts`：Better Auth 服务端配置
- `lib/auth-client.ts`：Better Auth 客户端
- `lib/auth/check-auth.ts`：认证工具函数（requireAuth, requireAdmin 等）
- `app/api/auth/[...all]/route.ts`：Better Auth API 路由
- `middleware.ts`：路由保护

---

## 任务开发指南

### 如何选择任务

1. 查看 `docs/REQUIREMENTS.md` 中的任务清单
2. 找到状态为 `[ ]`（未开始）的任务
3. 检查依赖项是否已完成
4. 优先选择 P0 > P1 > P2 优先级的任务
5. 可并行的任务可以在不同 worktree 同时开发

### 任务完成后

1. 在 `docs/REQUIREMENTS.md` 中更新任务状态为 `[x]`
2. 提交代码并推送
3. 如有必要，更新本文档

---

## 常见问题

### Q: 首次设置开发环境失败怎么办？

**症状**：`make setup` 报错

**排查步骤**：
1. 检查 Bun 是否安装：`bun --version`
2. 检查 Doppler CLI 是否安装：`doppler --version`
3. 确保已登录 Doppler：`doppler login`
4. 重新运行：`make setup`

### Q: Doppler 配置失败怎么办？

**症状**：`doppler setup` 报错或无法选择项目

**解决方案**：
```bash
# 1. 确保已登录
doppler login

# 2. 检查是否有项目访问权限
doppler projects

# 3. 手动配置（如果 setup 失败）
doppler configure set project db-bot-console
doppler configure set config dev
```

### Q: 如何切换 Doppler 环境？

```bash
# 查看当前配置
make doppler-status

# 切换到其他环境
doppler configure set config stg  # 切换到 stg 环境
doppler configure set config prd  # 切换到 prd 环境
```

### Q: 如何查看 Doppler 中的环境变量？

```bash
# 列出所有环境变量
doppler secrets

# 获取特定变量
doppler secrets get DATABASE_URL

# 导出所有变量到文件（调试用）
doppler secrets download --no-file --format env > .env.debug
```

### Q: Console 无法连接 Executor？

**排查步骤**：
1. 确认 Executor 已启动：`make dev-executor`
2. 检查端口是否正确：默认 8787
3. 检查 `EXECUTOR_SIGNING_SECRET` 是否一致
4. 查看 Executor 日志排查错误

### Q: 如何在不同分支使用不同的 Doppler 配置？

Doppler 配置是本地的，每个工作目录可以有不同配置：

```bash
# 在功能分支使用 dev 环境
doppler configure set config dev

# 在另一个 worktree 使用 stg 环境
cd ../providence-stg
doppler configure set config stg
```

### Q: 如何完全重置开发环境？

```bash
# 1. 清理依赖
rm -rf node_modules apps/*/node_modules packages/*/node_modules

# 2. 清理 Doppler 配置
rm .doppler.yaml

# 3. 重新设置
make setup
```

### Q: CI/CD 部署失败如何排查？

1. 检查 GitHub Secrets 配置是否正确
2. 查看 GitHub Actions 日志
3. 常见问题：
   - `DOPPLER_TOKEN` 不正确或已过期
   - `CLUSTER_DOPPLER_TOKEN_*` 在 Console prd 中未配置
   - 阿里云 AccessKey 权限不足

---

## MCP 工具使用指南

本项目集成了 MCP (Model Context Protocol) 工具，用于增强开发体验。

### Playwright MCP

Playwright MCP 提供了浏览器自动化能力，用于 E2E 测试和页面调试。

**核心操作：**

| 操作 | 说明 |
|------|------|
| `browser_navigate` | 导航到指定 URL |
| `browser_snapshot` | 获取页面可访问性快照（推荐用于页面分析） |
| `browser_take_screenshot` | 截取页面截图 |
| `browser_click` | 点击页面元素 |
| `browser_type` | 在输入框中输入文字 |
| `browser_fill_form` | 填写表单 |
| `browser_console_messages` | 获取浏览器控制台消息 |
| `browser_network_requests` | 获取网络请求记录 |
| `browser_evaluate` | 执行 JavaScript 代码 |
| `browser_wait_for` | 等待文本出现/消失或指定时间 |
| `browser_close` | 关闭浏览器 |

**使用场景：**

- 编写和调试 E2E 测试
- 验证页面交互流程
- 检查页面渲染问题
- 调试前端 JavaScript 错误

**最佳实践：**

```bash
# 1. 首先启动开发服务器
make dev-console

# 2. 使用 Playwright MCP 进行测试
# - 导航到 http://localhost:3000
# - 使用 browser_snapshot 分析页面结构
# - 使用 browser_click/browser_type 模拟用户操作
# - 使用 browser_console_messages 检查错误
```

**元素定位：**

- 优先使用 `browser_snapshot` 获取页面结构，它会返回带有 `ref` 属性的元素列表
- 使用返回的 `ref` 值进行 `browser_click`、`browser_type` 等操作
- `browser_snapshot` 比截图更高效，因为它返回可操作的元素引用

**调试技巧：**

- 页面加载后先使用 `browser_snapshot` 了解页面结构
- 遇到问题时检查 `browser_console_messages` 和 `browser_network_requests`
- 复杂操作可以使用 `browser_run_code` 执行自定义 Playwright 脚本
