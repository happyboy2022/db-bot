# Console - Claude 开发配置

SQL 执行管理后台系统，用于提交、审批和执行 SQL 请求。

## 项目概述

Console 是一个 Next.js 14+ App Router 应用，提供：

1. **SQL 请求管理** - 创建、编辑、审批 SQL 请求
2. **用户认证** - 基于 Better Auth 的用户注册和登录
3. **权限控制** - PENDING/USER/ADMIN 三级角色系统
4. **审计日志** - 所有操作可追溯

### 核心原则

- **Console 绝不直连目标数据库**，所有 DB 操作必须经由 Executor API
- 审计日志**只能追加**，禁止修改或删除
- 写操作（UPDATE/DELETE）必须**先预检后执行**
- 多语句**串行执行**，失败则终止后续

---

## 技术栈

| 组件 | 技术选型 |
|------|---------|
| 框架 | Next.js 14+ (App Router) |
| 运行时 | Bun |
| ORM | Drizzle ORM |
| 数据库 | Neon (Vercel Postgres) |
| 认证 | Better Auth |
| UI | Tailwind CSS + shadcn/ui |
| 部署 | Vercel |
| 环境变量 | Doppler |

---

## 目录结构

```
apps/console/
├── src/
│   ├── app/                          # App Router 页面
│   │   ├── (auth)/                   # 认证相关页面
│   │   │   ├── login/               # 登录
│   │   │   ├── register/            # 注册
│   │   │   ├── pending/             # 待激活
│   │   │   └── forbidden/           # 无权限
│   │   ├── (dashboard)/              # 主后台
│   │   │   ├── admin/               # 管理功能
│   │   │   │   ├── approvals/       # 审批管理
│   │   │   │   ├── audit/           # 审计日志
│   │   │   │   ├── clusters/        # 集群管理
│   │   │   │   ├── databases/       # 数据库管理
│   │   │   │   ├── sessions/        # 会话管理
│   │   │   │   ├── templates/       # 模板管理
│   │   │   │   └── users/           # 用户管理
│   │   │   ├── dashboard/           # 仪表盘
│   │   │   └── requests/            # 请求管理
│   │   │       ├── [id]/            # 请求详情
│   │   │       │   ├── edit/        # 编辑请求
│   │   │       │   └── execute/     # 执行请求
│   │   │       ├── import/          # 导入请求
│   │   │       └── new/             # 新建请求
│   │   ├── api/                      # API 路由
│   │   │   ├── auth/[...all]/       # Better Auth API
│   │   │   ├── approvals/           # 审批 API
│   │   │   └── requests/            # 请求 API
│   │   ├── layout.tsx               # 根布局
│   │   └── providers.tsx            # 全局 Provider
│   ├── components/                   # React 组件
│   │   ├── admin/                   # 管理组件
│   │   ├── layout/                  # 布局组件
│   │   ├── requests/                # 请求相关组件
│   │   ├── shared/                  # 共享组件
│   │   └── ui/                      # shadcn/ui 组件
│   ├── lib/                          # 工具库
│   │   ├── auth/                    # 认证相关
│   │   │   ├── index.ts            # barrel export
│   │   │   ├── check-auth.ts       # 服务端认证检查
│   │   │   └── use-auth.ts         # 客户端认证 hook
│   │   ├── contexts/                # React Context
│   │   ├── execution/               # SQL 执行逻辑
│   │   ├── executor/                # Executor API 客户端
│   │   ├── export/                  # 导入导出
│   │   ├── queries/                 # 数据库查询
│   │   ├── auth-client.ts          # Better Auth 客户端
│   │   ├── auth-config.ts          # Better Auth 配置
│   │   └── utils.ts                # 工具函数
│   ├── db/                           # 数据库层
│   │   ├── schema/                  # Drizzle schema
│   │   └── index.ts                 # 数据库连接
│   └── middleware.ts                 # Next.js 中间件
├── drizzle/                          # 数据库迁移
├── scripts/                          # 脚本
│   └── seed-admin.ts               # 创建管理员
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
└── tailwind.config.ts
```

---

## 认证系统

### 角色权限

| 角色 | 权限 |
|------|------|
| `PENDING` | 无法进入后台，等待激活 |
| `USER` | 创建请求、查看自己的请求 |
| `ADMIN` | 审批、执行、用户管理、会话管理、审计查看 |

### 认证流程

1. **注册** - 创建 users + accounts + profiles 记录，默认角色 PENDING
2. **登录** - Better Auth 验证密码，创建 session
3. **授权** - 中间件检查 session，页面组件检查角色

### 认证工具函数

```typescript
// 服务端组件中使用
import { requireAuth, requireAdmin, requireActiveUser, getCurrentUser } from '@/lib/auth';

// 需要登录
const user = await requireAuth();

// 需要管理员
const admin = await requireAdmin();

// 需要激活用户（非 PENDING）
const activeUser = await requireActiveUser();

// 获取当前用户（不重定向）
const user = await getCurrentUser();
```

---

## 请求状态流转

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

## 数据库层

### Schema 文件

| 文件 | 说明 |
|------|------|
| `users.ts` | Better Auth 用户表 |
| `profiles.ts` | 用户业务信息（角色、显示名） |
| `clusters.ts` | 集群配置 |
| `db-targets.ts` | 数据库目标 |
| `sql-requests.ts` | SQL 请求 |
| `sql-request-versions.ts` | 请求版本 |
| `sql-statements.ts` | SQL 语句 |
| `approvals.ts` | 审批记录 |
| `audit-logs.ts` | 审计日志 |
| `templates.ts` | SQL 模板 |

### 数据库迁移

**重要：禁止手动编写迁移 SQL，禁止使用 `db-push`**

```bash
# 1. 修改 schema 文件
# 2. 生成迁移
bun run db:generate

# 3. 提交迁移文件到 Git
# 4. CI 自动应用迁移
```

---

## Executor API 客户端

### 配置

Console 通过以下方式获取 Executor 配置：

1. 环境变量 `CLUSTER_DOPPLER_TOKEN_{CLUSTER}` → Doppler API
2. 数据库加密 Token → 解密后调用 Doppler API
3. Fallback：`EXECUTOR_BASE_URL` + `EXECUTOR_SIGNING_SECRET`

### 主要函数

```typescript
import { executeStatement, executePrecheck } from '@/lib/executor/client';
import { killSession, getSessions } from '@/lib/executor/sessions';

// 执行 SQL
const result = await executeStatement({
  requestId,
  version,
  statementId,
  clusterId,
  dbType,
  code,
  sql,
  timeoutMs,
});

// 预检查（获取影响行数）
const precheck = await executePrecheck({
  clusterId,
  dbType,
  code,
  sql,
});
```

---

## 开发命令

```bash
# 安装依赖
bun install

# 启动开发服务器（端口 3000）
bun run dev

# 或使用 Doppler
doppler run -- bun run dev

# 构建
bun run build

# 类型检查
bun run typecheck

# Lint
bun run lint

# 数据库操作
bun run db:generate    # 生成迁移
bun run db:migrate     # 应用迁移
bun run db:studio      # 打开 Drizzle Studio
bun run db:seed        # 创建本地管理员
```

---

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `DATABASE_URL` | Neon 数据库连接字符串 | ✅ |
| `BETTER_AUTH_SECRET` | Better Auth 会话签名密钥 | ✅ |
| `NEXT_PUBLIC_APP_URL` | Console URL | ✅ |
| `EXECUTOR_BASE_URL` | Executor 服务 URL | ✅ |
| `EXECUTOR_SIGNING_SECRET` | Executor HMAC 签名密钥 | ✅ |
| `CLUSTER_DOPPLER_TOKEN_*` | 各集群的 Doppler Token | ❌ |

---

## 开发规范

### 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `request-list.tsx` |
| React 组件 | PascalCase | `RequestList` |
| 函数 | camelCase | `getRequests()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RESULT_ROWS` |
| 数据库表 | snake_case | `sql_requests` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |

### 导入规范

**使用 barrel export：**

```typescript
// ✅ 正确
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { getRequests, getClusters } from '@/lib/queries';

// ❌ 错误 - 绕过 barrel export
import { requireAdmin } from '@/lib/auth/check-auth';
```

### 语言规范

- **所有用户界面文字必须使用中文**
- 代码注释可以使用中文或英文
- 变量名、函数名等标识符使用英文

---

## 组件架构

### 布局组件

- `Header` - 顶部导航栏
- `Sidebar` - 侧边栏导航
- `TabBar` - 标签页导航

### 共享组件

- `ConfirmDeleteDialog` - 通用删除确认弹窗
- `PageLoading` - 页面加载状态

### UI 组件

基于 shadcn/ui，位于 `src/components/ui/`：

- Button, Dialog, Input, Select, Toast 等

---

## 关键业务逻辑

### SQL 执行流程

1. **创建请求** - 用户提交 SQL，解析为语句列表
2. **审批** - 管理员审批，设置 24h 有效期
3. **预检查** - 执行前查询影响行数
4. **确认** - 用户输入请求 ID 确认
5. **执行** - 串行执行语句，失败则跳过后续
6. **记录** - 写入审计日志

### SQL 校验规则

**允许的语句类型：**
- SELECT
- UPDATE（必须有 WHERE）
- DELETE（必须有 WHERE）

**禁止的语句类型：**
- DDL：CREATE, ALTER, DROP, TRUNCATE
- 权限：GRANT, REVOKE
- 其他：SET, CALL, DELIMITER

---

## 常见问题

### Q: 如何创建本地管理员？

```bash
doppler run -- bun run db:seed
```

创建管理员：
- 邮箱: `admin@localhost.dev`
- 密码: `admin123456`

### Q: 如何添加新的管理页面？

1. 在 `src/app/(dashboard)/admin/` 创建目录
2. 添加 `page.tsx`（服务端组件）
3. 添加 `actions.ts`（Server Actions）
4. 添加 `loading.tsx`（加载状态）
5. 更新 `Sidebar` 添加导航链接

### Q: 如何添加新的数据库表？

1. 在 `src/db/schema/` 创建 schema 文件
2. 在 `src/db/schema/index.ts` 导出
3. 运行 `bun run db:generate` 生成迁移
4. 提交迁移文件

### Q: Server Actions vs API Routes？

- **Server Actions** - 表单提交、数据修改（推荐）
- **API Routes** - 需要被外部调用、需要特殊 HTTP 处理
