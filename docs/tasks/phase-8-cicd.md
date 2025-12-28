# 阶段八：CI/CD 与开发环境

## 概述

本阶段完成 CI/CD 流水线配置和本地开发环境文档。

## 任务列表

### T-023: 审批过期任务

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-005**
- **可并行：是**（独立功能）

#### 任务描述

实现定时任务检查并过期审批。

参考文档：[请求工作流 - 审批过期处理](../specs/request-workflow.md#7-审批过期处理)

#### 详细步骤

使用 Vercel Cron 或 GitHub Actions 实现定时任务：

1. 创建 API 路由（`src/app/api/cron/expire-approvals/route.ts`）：
   ```typescript
   import { db } from '@/db';
   import { sqlRequests, auditLogs } from '@/db/schema';
   import { eq, lt, and } from 'drizzle-orm';

   export async function POST(request: Request) {
     // 验证 cron 密钥
     const authHeader = request.headers.get('authorization');
     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return new Response('Unauthorized', { status: 401 });
     }

     // 查找过期的审批
     const expiredRequests = await db
       .select({ id: sqlRequests.id })
       .from(sqlRequests)
       .where(
         and(
           eq(sqlRequests.status, 'APPROVED'),
           lt(sqlRequests.expiresAt, new Date())
         )
       );

     if (expiredRequests.length === 0) {
       return Response.json({ message: 'No expired approvals', count: 0 });
     }

     const requestIds = expiredRequests.map((r) => r.id);

     // 更新状态
     await db
       .update(sqlRequests)
       .set({ status: 'APPROVAL_EXPIRED', updatedAt: new Date() })
       .where(inArray(sqlRequests.id, requestIds));

     // 写入审计日志
     await db.insert(auditLogs).values(
       requestIds.map((id) => ({
         action: 'request.expired',
         targetType: 'request',
         targetId: id,
         payload: { reason: '24-hour approval window expired' },
       }))
     );

     return Response.json({ message: 'Approvals expired', count: requestIds.length });
   }
   ```

2. 配置 Vercel Cron（`vercel.json`）：
   ```json
   {
     "crons": [{
       "path": "/api/cron/expire-approvals",
       "schedule": "*/5 * * * *"
     }]
   }
   ```

#### 产出文件

- `apps/console/src/app/api/cron/expire-approvals/route.ts`
- `apps/console/vercel.json`

#### 验收标准

- [x] API 路由可以正确处理请求
- [x] 正确识别过期的审批
- [x] 正确更新状态为 APPROVAL_EXPIRED
- [x] 正确写入审计日志
- [x] 定时任务每 5 分钟执行一次

---

### T-024: GitHub Actions - Console

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-002**
- **可并行：是**（独立配置）

#### 任务描述

配置 Console 应用的 CI/CD 流水线。

#### 详细步骤

1. 创建工作流文件（`.github/workflows/console.yml`）：
   ```yaml
   name: Console CI/CD

   on:
     push:
       branches: [main]
       paths:
         - 'apps/console/**'
         - 'packages/shared/**'
         - '.github/workflows/console.yml'
     pull_request:
       branches: [main]
       paths:
         - 'apps/console/**'
         - 'packages/shared/**'

   env:
     TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
     TURBO_TEAM: ${{ vars.TURBO_TEAM }}

   jobs:
     lint-and-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Bun
           uses: oven-sh/setup-bun@v1
           with:
             bun-version: latest

         - name: Install dependencies
           run: bun install

         - name: Lint
           run: bun run lint --filter=console

         - name: Type check
           run: bun run typecheck --filter=console

         - name: Test
           run: bun run test --filter=console

         - name: Build
           run: bun run build --filter=console

     deploy:
       needs: lint-and-test
       if: github.ref == 'refs/heads/main' && github.event_name == 'push'
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Bun
           uses: oven-sh/setup-bun@v1

         - name: Install dependencies
           run: bun install

         - name: Deploy to Vercel
           uses: amondnet/vercel-action@v25
           with:
             vercel-token: ${{ secrets.VERCEL_TOKEN }}
             vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
             vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
             working-directory: apps/console
             vercel-args: '--prod'
           env:
             DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
   ```

2. 配置 GitHub Secrets：
   - `VERCEL_TOKEN` - Vercel API Token
   - `VERCEL_ORG_ID` - Vercel Organization ID
   - `VERCEL_PROJECT_ID` - Vercel Project ID
   - `DOPPLER_TOKEN` - Doppler Service Token（用于获取所有环境变量）

3. 配置 Vercel 项目：
   - 设置 Root Directory 为 `apps/console`
   - 配置环境变量
   - 禁用自动部署（由 GitHub Actions 触发）

#### 产出文件

- `.github/workflows/console.yml`

#### 验收标准

- [x] PR 时运行 lint、typecheck、test、build
- [x] main 分支推送时自动部署到 Vercel
- [x] 只在相关文件变更时触发

---

### T-025: GitHub Actions - Executor

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-003**
- **可并行：是**（独立配置）

#### 任务描述

配置 Executor 服务的 CI/CD 流水线。

#### 详细步骤

1. 创建工作流文件（`.github/workflows/executor.yml`）：
   ```yaml
   name: Executor CI/CD

   on:
     push:
       branches: [main]
       paths:
         - 'apps/executor/**'
         - 'packages/shared/**'
         - '.github/workflows/executor.yml'
     pull_request:
       branches: [main]
       paths:
         - 'apps/executor/**'
         - 'packages/shared/**'

   jobs:
     lint-and-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Bun
           uses: oven-sh/setup-bun@v1

         - name: Install dependencies
           run: bun install

         - name: Lint
           run: bun run lint --filter=executor

         - name: Type check
           run: bun run typecheck --filter=executor

         - name: Test
           run: bun run test --filter=executor

         - name: Build
           run: bun run build --filter=executor

     deploy:
       needs: lint-and-test
       if: github.ref == 'refs/heads/main' && github.event_name == 'push'
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Bun
           uses: oven-sh/setup-bun@v1

         - name: Install dependencies
           run: bun install

         - name: Build
           run: cd apps/executor && bun run build

         - name: Setup Serverless Devs
           uses: Serverless-Devs/serverless-devs-setup@v1
           with:
             access-key-id: ${{ secrets.ALICLOUD_ACCESS_KEY_ID }}
             access-key-secret: ${{ secrets.ALICLOUD_ACCESS_KEY_SECRET }}

         - name: Deploy to Aliyun FC
           run: |
             cd apps/executor
             s deploy -y
           env:
             EXECUTOR_API_TOKEN: ${{ secrets.EXECUTOR_API_TOKEN }}
             SERVICE_DB_CONFIG_JSON: ${{ secrets.SERVICE_DB_CONFIG_JSON }}
             ALIYUN_REGION: ${{ vars.ALIYUN_REGION }}
   ```

2. 配置 GitHub Secrets：
   - `ALICLOUD_ACCESS_KEY_ID` - 阿里云 Access Key ID
   - `ALICLOUD_ACCESS_KEY_SECRET` - 阿里云 Access Key Secret
   - `EXECUTOR_API_TOKEN` - Executor API Token
   - `SERVICE_DB_CONFIG_JSON` - 数据库连接配置 JSON

3. 配置 GitHub Variables：
   - `ALIYUN_REGION` - 阿里云区域（如 cn-hangzhou）

#### 产出文件

- `.github/workflows/executor.yml`

#### 验收标准

- [x] PR 时运行 lint、typecheck、test、build
- [x] main 分支推送时自动部署到阿里云 FC
- [x] 只在相关文件变更时触发

---

### T-026: 数据库迁移 Action

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-005, T-024**
- **可并行：否**

#### 任务描述

配置数据库迁移的 CI/CD 流程。

#### 详细步骤

1. 创建工作流文件（`.github/workflows/migrate.yml`）：
   ```yaml
   name: Database Migration

   on:
     push:
       branches: [main]
       paths:
         - 'apps/console/drizzle/migrations/**'
         - 'apps/console/src/db/schema/**'
         - '.github/workflows/migrate.yml'

   jobs:
     migrate:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Bun
           uses: oven-sh/setup-bun@v1

         - name: Install dependencies
           run: bun install

         - name: Run migrations
           run: |
             cd apps/console
             bun drizzle-kit migrate
           env:
             DATABASE_URL: ${{ secrets.DATABASE_URL }}
   ```

2. 配置 GitHub Secrets：
   - `DATABASE_URL` - Neon 数据库连接 URL
   - `DOPPLER_TOKEN` - Doppler Service Token

#### 产出文件

- `.github/workflows/migrate.yml`

#### 验收标准

- [x] Schema 文件变更时自动运行迁移
- [x] 迁移失败时阻止后续部署

---

### T-027: 本地开发文档

- [x] **状态：已完成**
- **优先级：P2**
- **依赖：T-002, T-003, T-005**
- **可并行：是**

#### 任务描述

编写本地开发环境搭建文档，使用 Makefile 管理命令，TypeScript 脚本，Doppler 环境变量管理。

#### 实现功能

**Makefile 命令管理：**

```bash
make help          # 查看所有命令
make setup         # 首次设置
make dev           # 启动所有服务
make dev-console   # 仅启动 Console
make dev-executor  # 仅启动 Executor
```

**TypeScript 开发脚本：**
- `scripts/setup.ts` - 首次设置（检查依赖、配置 Doppler）
- `scripts/dev.ts` - 开发服务器启动（支持 --console/--executor 选项）

**Doppler 环境变量管理：**
```bash
make doppler-login   # 登录 Doppler
make doppler-setup   # 配置项目
make doppler-status  # 查看配置状态
```

**数据库管理：**
```bash
make db-generate   # 生成迁移
make db-migrate    # 应用迁移
make db-studio     # 打开 Drizzle Studio
make db-seed       # 创建开发管理员
```

#### 产出文件

- `Makefile` - 命令管理（开发、构建、数据库、Doppler）
- `scripts/setup.ts` - TypeScript 首次设置脚本
- `scripts/dev.ts` - TypeScript 开发服务器脚本
- `README.md`（更新 - Makefile 快速开始）
- `CLAUDE.md`（更新 - Makefile 命令）
- `docs/dev/local-development.md` - 详细本地开发文档
- `docs/README.md`（更新 - 添加开发指南链接）

#### 验收标准

- [x] Makefile 提供完整的命令管理
- [x] TypeScript 脚本替代 shell 脚本
- [x] 使用 Doppler 管理环境变量
- [x] README 包含完整的快速开始指南
- [x] 环境变量示例完整
- [x] 本地开发流程清晰
- [x] 详细的本地开发文档
