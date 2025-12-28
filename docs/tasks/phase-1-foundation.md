# 阶段一：基础设施

## 概述

本阶段完成项目的基础架构搭建，包括 Monorepo 工作区、Console 应用、Executor 应用和共享包的初始化。

## 任务列表

### T-001: 初始化 Monorepo 工作区

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：无**
- **可并行：否**（其他任务依赖此任务）

#### 任务描述

初始化 Turborepo 工作区，配置 Bun workspaces。

#### 详细步骤

1. 初始化 Turborepo：
   ```bash
   bunx create-turbo@latest harrisburg
   ```

2. 配置根目录 `package.json`：
   ```json
   {
     "name": "sql-ops-console",
     "private": true,
     "workspaces": ["apps/*", "packages/*"],
     "scripts": {
       "dev": "turbo dev",
       "build": "turbo build",
       "lint": "turbo lint",
       "typecheck": "turbo typecheck",
       "test": "turbo test"
     }
   }
   ```

3. 配置 `turbo.json`：
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "globalDependencies": ["**/.env.*local"],
     "pipeline": {
       "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
       "dev": { "cache": false, "persistent": true },
       "lint": {},
       "typecheck": {}
     }
   }
   ```

4. 创建目录结构：
   ```
   apps/
   packages/
   ```

5. 配置 TypeScript（根目录 `tsconfig.json`）

6. 配置 ESLint、Prettier

7. 创建 `.gitignore`

8. 创建 `.env.example`

#### 产出文件

- `package.json`
- `turbo.json`
- `tsconfig.json`
- `.gitignore`
- `.env.example`
- `.eslintrc.js`
- `.prettierrc`

#### 验收标准

- [x] `bun install` 成功执行
- [x] 目录结构正确创建
- [x] TypeScript 配置正确

---

### T-002: 初始化 Console 应用

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-001**
- **可并行：是**（可与 T-003、T-004 并行）

#### 任务描述

使用 Next.js 14+ 创建管理后台应用，配置 Tailwind CSS 和 shadcn/ui。

#### 详细步骤

1. 创建 Next.js 应用：
   ```bash
   cd apps
   bunx create-next-app@latest console --typescript --tailwind --eslint --app --src-dir
   ```

2. 安装依赖：
   ```bash
   cd console
   bun add drizzle-orm better-auth @neondatabase/serverless
   bun add zod @tanstack/react-query
   bun add -D drizzle-kit
   ```

3. 初始化 shadcn/ui：
   ```bash
   bunx shadcn-ui@latest init
   ```

4. 安装常用 shadcn 组件：
   ```bash
   bunx shadcn-ui@latest add button card form input table dialog toast
   ```

5. 配置 Tailwind CSS（如需自定义）

6. 创建基础目录结构：
   ```
   src/
   ├── app/
   │   ├── (auth)/
   │   └── (dashboard)/
   ├── components/
   │   ├── ui/
   │   ├── requests/
   │   └── admin/
   ├── lib/
   │   ├── auth.ts
   │   └── auth-client.ts
   └── db/
       └── schema/
   ```

7. 创建基础布局组件：
   - `src/app/layout.tsx`
   - `src/components/layout/sidebar.tsx`
   - `src/components/layout/header.tsx`

#### 产出文件

- `apps/console/package.json`
- `apps/console/tailwind.config.ts`
- `apps/console/src/app/layout.tsx`
- `apps/console/src/components/ui/*`
- `apps/console/components.json`

#### 验收标准

- [x] `bun dev` 成功启动
- [x] 访问 localhost:3000 显示页面
- [x] shadcn/ui 组件可用

---

### T-003: 初始化 Executor 应用

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-001**
- **可并行：是**（可与 T-002、T-004 并行）

#### 任务描述

使用 Hono 创建 SQL 执行服务，配置阿里云 FC 3.0 部署。

#### 详细步骤

1. 创建 Hono 应用：
   ```bash
   cd apps
   mkdir executor && cd executor
   bun init
   bun add hono
   bun add mysql2 zod node-sql-parser
   bun add -D @types/node typescript
   ```

2. 配置 TypeScript（`tsconfig.json`）

3. 创建目录结构：
   ```
   src/
   ├── index.ts
   ├── routes/
   │   ├── execute.ts
   │   ├── sessions.ts
   │   └── health.ts
   ├── middleware/
   │   └── auth.ts
   ├── services/
   │   └── executor.ts
   ├── validators/
   │   └── sql.ts
   └── db/
       ├── pool.ts
       └── config.ts
   ```

4. 实现基础入口（`src/index.ts`）：
   ```typescript
   import { Hono } from 'hono';
   import { cors } from 'hono/cors';
   import { logger } from 'hono/logger';

   const app = new Hono();

   app.use('*', logger());
   app.use('*', cors());

   app.get('/api/v1/health', (c) => c.json({ status: 'ok' }));

   export default app;
   ```

5. 实现 Bearer Token 认证中间件：
   ```typescript
   // src/middleware/auth.ts
   export const authMiddleware = async (c, next) => {
     const token = c.req.header('Authorization')?.replace('Bearer ', '');
     if (token !== process.env.EXECUTOR_API_TOKEN) {
       return c.json({ error: 'Unauthorized' }, 401);
     }
     await next();
   };
   ```

6. 创建 `s.yaml`（Serverless-devs 配置）：
   ```yaml
   edition: 3.0.0
   name: sql-ops-executor
   access: aliyun

   resources:
     executor:
       component: fc3
       props:
         region: ${env.ALIYUN_REGION}
         functionName: sql-ops-executor
         runtime: custom.debian10
         handler: index.handler
         timeout: 60
         memorySize: 256
   ```

7. 配置 package.json scripts：
   ```json
   {
     "scripts": {
       "dev": "bun run --watch src/index.ts",
       "build": "bun build src/index.ts --outdir dist",
       "deploy": "s deploy"
     }
   }
   ```

#### 产出文件

- `apps/executor/package.json`
- `apps/executor/tsconfig.json`
- `apps/executor/src/index.ts`
- `apps/executor/src/middleware/auth.ts`
- `apps/executor/src/routes/health.ts`
- `apps/executor/s.yaml`
- `apps/executor/.env.example`

#### 验收标准

- [x] `bun dev` 成功启动
- [x] 访问 /api/v1/health 返回 `{ status: 'ok' }`
- [x] 无 Token 访问受保护端点返回 401

---

### T-004: 创建共享包

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-001**
- **可并行：是**（可与 T-002、T-003 并行）

#### 任务描述

创建共享的 TypeScript 类型、常量和 Zod schemas。

#### 详细步骤

1. 创建包目录：
   ```bash
   cd packages
   mkdir shared && cd shared
   bun init
   bun add zod
   bun add -D typescript
   ```

2. 配置 `package.json`：
   ```json
   {
     "name": "@sql-ops/shared",
     "version": "0.0.1",
     "main": "./src/index.ts",
     "types": "./src/index.ts",
     "exports": {
       ".": "./src/index.ts",
       "./types": "./src/types/index.ts",
       "./constants": "./src/constants/index.ts",
       "./schemas": "./src/schemas/index.ts"
     }
   }
   ```

3. 创建目录结构：
   ```
   src/
   ├── index.ts
   ├── types/
   │   ├── index.ts
   │   ├── user.ts
   │   ├── request.ts
   │   ├── statement.ts
   │   └── approval.ts
   ├── constants/
   │   ├── index.ts
   │   ├── status.ts
   │   └── limits.ts
   └── schemas/
       ├── index.ts
       └── execute.ts
   ```

4. 定义类型（`src/types/request.ts`）：
   ```typescript
   export type RequestStatus =
     | 'PENDING_APPROVAL'
     | 'CHANGES_REQUESTED'
     | 'REJECTED'
     | 'APPROVED'
     | 'APPROVAL_EXPIRED'
     | 'EXECUTING'
     | 'SUCCEEDED'
     | 'FAILED'
     | 'TERMINATED';

   export type StatementType = 'select' | 'update' | 'delete';

   export type StatementStatus =
     | 'PENDING'
     | 'EXECUTING'
     | 'SUCCEEDED'
     | 'FAILED'
     | 'SKIPPED';
   ```

5. 定义常量（`src/constants/limits.ts`）：
   ```typescript
   export const MAX_AFFECTED_ROWS = 1000;
   export const APPROVAL_EXPIRY_HOURS = 24;
   export const MAX_RESULT_ROWS = 200;
   export const DEFAULT_TIMEOUT_MS = 30000;
   export const MAX_TIMEOUT_MS = 120000;
   ```

6. 定义 Zod schemas（`src/schemas/execute.ts`）：
   ```typescript
   import { z } from 'zod';

   export const executeRequestSchema = z.object({
     requestId: z.string().uuid(),
     version: z.number().int().positive(),
     statementId: z.string().uuid(),
     serviceId: z.string().min(1),
     dbType: z.literal('polardb_mysql'),
     dbRole: z.enum(['primary', 'record']),
     sql: z.string().min(1),
     timeoutMs: z.number().int().min(1000).max(120000).default(30000),
   });
   ```

#### 产出文件

- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/types/*.ts`
- `packages/shared/src/constants/*.ts`
- `packages/shared/src/schemas/*.ts`

#### 验收标准

- [x] Console 可以 import `@sql-ops/shared`
- [x] Executor 可以 import `@sql-ops/shared`
- [x] TypeScript 类型正确导出
