# 系统架构

## 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户浏览器                                  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Console (Vercel)                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Next.js   │  │ Better Auth │  │   Drizzle   │  │  shadcn/ui  │    │
│  │ App Router  │  │             │  │     ORM     │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
┌───────────────────────────┐    ┌───────────────────────────────────────┐
│   Neon (Vercel Postgres)  │    │         Executor (阿里云 FC 3.0)       │
│  ┌─────────────────────┐  │    │  ┌─────────────┐  ┌─────────────┐    │
│  │ profiles            │  │    │  │    Hono     │  │   mysql2    │    │
│  │ sql_requests        │  │    │  └─────────────┘  └─────────────┘    │
│  │ sql_statements      │  │    └───────────────────────┬───────────────┘
│  │ approvals           │  │                            │
│  │ audit_logs          │  │                            ▼
│  │ sql_templates       │  │    ┌───────────────────────────────────────┐
│  └─────────────────────┘  │    │            内网 VPC                    │
│                           │    │  ┌─────────────┐  ┌─────────────┐    │
│                           │    │  │  PolarDB    │  │  PolarDB    │    │
│                           │    │  │  Primary    │  │  Record     │    │
└───────────────────────────┘    │  └─────────────┘  └─────────────┘    │
                                 └───────────────────────────────────────┘
```

## 2. 技术栈详情

### 2.1 Console（管理后台）

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14+ | Web 框架（App Router） |
| Bun | latest | 运行时与包管理 |
| Better Auth | latest | 用户认证 |
| Neon (Vercel Postgres) | - | 业务数据库 |
| Drizzle ORM | latest | 数据库 ORM |
| Tailwind CSS | 3.x | 样式框架 |
| shadcn/ui | latest | UI 组件库 |
| Zod | latest | 运行时类型校验 |
| node-sql-parser | latest | SQL 解析（客户端预览） |

### 2.2 Executor（执行服务）

| 技术 | 版本 | 用途 |
|------|------|------|
| Hono | latest | Web 框架 |
| Bun | latest | 运行时 |
| mysql2 | latest | MySQL 驱动 |
| node-sql-parser | latest | SQL 校验 |
| Zod | latest | 请求校验 |

## 3. 目录结构

```
amman/
├── CLAUDE.md                    # Claude 开发配置
├── docs/                        # 文档目录
│   ├── README.md               # 文档索引
│   ├── overview/               # 项目概述
│   ├── specs/                  # 功能规格
│   └── tasks/                  # 开发任务
├── apps/
│   ├── console/                # Next.js 管理后台
│   │   ├── src/
│   │   │   ├── app/           # App Router 页面
│   │   │   │   ├── (auth)/    # 认证相关页面
│   │   │   │   └── (dashboard)/ # 主功能页面
│   │   │   ├── components/    # React 组件
│   │   │   │   ├── ui/        # shadcn 基础组件
│   │   │   │   ├── requests/  # 请求相关组件
│   │   │   │   └── admin/     # 管理相关组件
│   │   │   ├── lib/           # 工具库
│   │   │   │   ├── auth.ts    # Better Auth 服务端配置
│   │   │   │   └── auth-client.ts # Better Auth 客户端
│   │   │   └── db/            # Drizzle schema
│   │   └── drizzle/           # 数据库迁移
│   └── executor/              # Hono 执行服务
│       ├── src/
│       │   ├── routes/        # API 路由
│       │   ├── services/      # 业务逻辑
│       │   ├── validators/    # SQL 校验
│       │   ├── middleware/    # 中间件
│       │   └── db/            # 数据库连接
│       └── s.yaml             # Serverless-devs 配置
├── packages/
│   └── shared/                # 共享代码
│       ├── types/             # TypeScript 类型
│       ├── validators/        # 校验逻辑
│       ├── constants/         # 常量定义
│       └── schemas/           # Zod schemas
├── .github/
│   └── workflows/             # GitHub Actions
├── turbo.json                 # Turborepo 配置
└── package.json               # 工作区配置
```

## 4. 数据流

### 4.1 SQL 请求创建流程

```
用户 → 创建请求 → SQL 拆分 → 规则校验 → 写入 Neon → 等待审批
```

### 4.2 审批流程

```
Admin → 审批队列 → 查看请求 → 审批决策 → 写入 approvals + audit_logs
                                  ↓
                          APPROVE: 设置 expires_at (24h)
                          REJECT: 需填写原因
                          CHANGES_REQUESTED: 需填写修改意见
```

### 4.3 执行流程

```
Admin → 请求详情 → 点击执行
                     ↓
              ┌──────────────────┐
              │   预检阶段        │
              │ Console 调用     │
              │ Executor 执行    │
              │ SELECT COUNT     │
              └────────┬─────────┘
                       ↓
              ┌──────────────────┐
              │   确认阶段        │
              │ 显示影响行数      │
              │ 输入确认信息      │
              │ (>1000 额外确认) │
              └────────┬─────────┘
                       ↓
              ┌──────────────────┐
              │   执行阶段        │
              │ 逐条执行 SQL     │
              │ 失败则终止后续    │
              │ 记录结果到审计    │
              └──────────────────┘
```

## 5. 安全设计

### 5.1 网络隔离
- Console 部署在 Vercel（公网）
- Executor 部署在阿里云 FC（VPC 内网）
- 只有 Executor 可以访问数据库

### 5.2 认证鉴权
- Console 用户认证：Better Auth
- Console → Executor 通信：Bearer Token + HMAC 签名
- 数据访问控制：应用层权限检查

### 5.3 数据保护
- 审计日志只能追加，不可修改删除
- 敏感操作需要二次确认
- SQL 执行前双重校验（Console + Executor）

## 6. 部署架构

### 6.1 环境划分

| 环境 | Console | Executor | 数据库 |
|------|---------|----------|--------|
| Development | localhost:3000 | localhost:8787 | Neon Dev |
| Staging | staging.xxx.com | staging-executor.fc.aliyuncs.com | Neon Staging |
| Production | console.xxx.com | executor.fc.aliyuncs.com | Neon Production |

### 6.2 CI/CD 流程

```
代码推送 → GitHub Actions
              │
              ├── PR: lint + typecheck + test + build
              │
              └── main 分支:
                    ├── Console → Vercel 部署
                    ├── Executor → 阿里云 FC 部署
                    └── Database → Drizzle 迁移
```
