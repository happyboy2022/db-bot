# 阶段二：数据库与认证

## 概述

本阶段完成数据库 Schema 设计、Better Auth 客户端配置和认证流程实现。

## 任务列表

### T-005: Drizzle Schema 设计与迁移

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-002**
- **可并行：否**

#### 任务描述

使用 Drizzle ORM 设计数据库 Schema，创建迁移文件和 RLS 策略。

#### 详细步骤

1. 配置 Drizzle（`drizzle.config.ts`）：
   ```typescript
   import { defineConfig } from 'drizzle-kit';

   export default defineConfig({
     schema: './src/db/schema/index.ts',
     out: './drizzle/migrations',
     dialect: 'postgresql',
     dbCredentials: {
       url: process.env.DATABASE_URL!,
     },
   });
   ```

2. 创建枚举定义（`src/db/schema/enums.ts`）：
   ```typescript
   import { pgEnum } from 'drizzle-orm/pg-core';

   export const userRole = pgEnum('user_role', ['PENDING', 'USER', 'ADMIN']);
   export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);
   export const requestStatus = pgEnum('request_status', [
     'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED',
     'APPROVED', 'APPROVAL_EXPIRED', 'EXECUTING',
     'SUCCEEDED', 'FAILED', 'TERMINATED'
   ]);
   export const statementType = pgEnum('statement_type', ['select', 'update', 'delete']);
   export const statementStatus = pgEnum('statement_status', [
     'PENDING', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'SKIPPED'
   ]);
   export const approvalDecision = pgEnum('approval_decision', [
     'APPROVE', 'REJECT', 'CHANGES_REQUESTED'
   ]);
   ```

3. 创建表定义（参考 [数据模型文档](../specs/data-model.md)）：
   - `src/db/schema/profiles.ts`
   - `src/db/schema/services.ts`
   - `src/db/schema/db-targets.ts`
   - `src/db/schema/sql-requests.ts`
   - `src/db/schema/sql-request-versions.ts`
   - `src/db/schema/sql-statements.ts`
   - `src/db/schema/approvals.ts`
   - `src/db/schema/audit-logs.ts`
   - `src/db/schema/sql-templates.ts`

4. 创建索引（`src/db/schema/index.ts`）

5. 生成迁移文件：
   ```bash
   bun drizzle-kit generate
   ```

6. 创建权限检查逻辑（应用层实现）：
   - profiles 表权限检查
   - sql_requests 表权限检查
   - audit_logs 表权限检查（只允许 INSERT）

7. 创建用户注册钩子（Better Auth 插件实现）：
   - 用户注册自动创建 profile

#### 产出文件

- `apps/console/drizzle.config.ts`
- `apps/console/src/db/schema/*.ts`
- `apps/console/drizzle/migrations/*.sql`

#### 验收标准

- [x] `bun drizzle-kit push` 成功执行
- [x] 所有表在 Neon 中创建成功
- [x] 权限检查逻辑正确实现
- [x] 用户注册钩子正常工作

---

### T-006: Better Auth 客户端配置

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-002**
- **可并行：是**（可与 T-005 并行）

#### 任务描述

配置 Better Auth 认证系统，支持 Server Components 和 Server Actions。

#### 详细步骤

1. 创建服务端配置（`src/lib/auth.ts`）：
   ```typescript
   import { betterAuth } from 'better-auth';
   import { drizzleAdapter } from 'better-auth/adapters/drizzle';
   import { db } from '@/db';

   export const auth = betterAuth({
     database: drizzleAdapter(db, { provider: 'pg' }),
     emailAndPassword: { enabled: true },
   });
   ```

2. 创建客户端配置（`src/lib/auth-client.ts`）：
   ```typescript
   import { createAuthClient } from 'better-auth/react';

   export const authClient = createAuthClient({
     baseURL: process.env.NEXT_PUBLIC_APP_URL,
   });
   ```

3. 创建 Drizzle 客户端（`src/db/index.ts`）：
   ```typescript
   import { drizzle } from 'drizzle-orm/neon-http';
   import { neon } from '@neondatabase/serverless';
   import * as schema from './schema';

   const sql = neon(process.env.DATABASE_URL!);
   export const db = drizzle(sql, { schema });
   ```

4. 配置环境变量：
   ```env
   DATABASE_URL=
   BETTER_AUTH_SECRET=
   BETTER_AUTH_TRUSTED_ORIGINS=
   NEXT_PUBLIC_APP_URL=
   ```

#### 产出文件

- `apps/console/src/lib/auth.ts`
- `apps/console/src/lib/auth-client.ts`
- `apps/console/src/db/index.ts`

#### 验收标准

- [x] Server Component 中可以查询数据
- [x] Client Component 中可以查询数据
- [x] Better Auth 认证正常工作

---

### T-007: 认证中间件与路由保护

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-005, T-006**
- **可并行：否**

#### 任务描述

实现 Next.js middleware 进行路由保护和角色检查。

#### 详细步骤

1. 创建中间件（`middleware.ts`）：
   ```typescript
   import { NextResponse, type NextRequest } from 'next/server';
   import { auth } from '@/lib/auth';

   const publicPaths = ['/login', '/register', '/pending', '/forbidden'];
   const adminPaths = ['/admin'];

   export async function middleware(request: NextRequest) {
     const pathname = request.nextUrl.pathname;

     // 公共路径直接放行
     if (publicPaths.some(p => pathname.startsWith(p))) {
       return NextResponse.next();
     }

     // 检查用户登录状态（使用 Better Auth）
     const session = await auth.api.getSession({
       headers: request.headers,
     });

     if (!session) {
       return NextResponse.redirect(new URL('/login', request.url));
     }

     // 获取用户 profile（从 session 或数据库获取）
     const profile = session.user.profile;

     // 检查用户状态
     if (!profile || profile.role === 'PENDING') {
       return NextResponse.redirect(new URL('/pending', request.url));
     }
     if (profile.status === 'SUSPENDED') {
       return NextResponse.redirect(new URL('/forbidden', request.url));
     }

     // 检查 Admin 路径权限
     if (adminPaths.some(p => pathname.startsWith(p)) && profile.role !== 'ADMIN') {
       return NextResponse.redirect(new URL('/forbidden', request.url));
     }

     return NextResponse.next();
   }

   export const config = {
     matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
   };
   ```

2. 创建权限检查 hook（`src/lib/auth/use-auth.ts`）

3. 创建服务端权限检查函数（`src/lib/auth/check-auth.ts`）：
   ```typescript
   import { auth } from '@/lib/auth';
   import { redirect } from 'next/navigation';

   export async function requireAuth() {
     const session = await auth.api.getSession();
     if (!session) redirect('/login');
     return session.user;
   }

   export async function requireAdmin() {
     const user = await requireAuth();
     const profile = user.profile;
     if (profile?.role !== 'ADMIN') redirect('/forbidden');
     return user;
   }
   ```

#### 产出文件

- `apps/console/middleware.ts`
- `apps/console/src/lib/auth/use-auth.ts`
- `apps/console/src/lib/auth/check-auth.ts`

#### 验收标准

- [x] 未登录用户访问受保护页面重定向到 /login
- [x] PENDING 用户重定向到 /pending
- [x] SUSPENDED 用户重定向到 /forbidden
- [x] USER 访问 /admin 重定向到 /forbidden
- [x] ADMIN 可以访问所有页面

---

### T-008: 认证页面

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-006**
- **可并行：是**（可与 T-007 并行）

#### 任务描述

实现登录、注册、等待激活、无权限页面。

#### 详细步骤

1. 创建登录页面（`src/app/(auth)/login/page.tsx`）：
   - Email 输入框
   - Password 输入框
   - 登录按钮
   - 注册链接
   - 错误提示

2. 创建登录 Server Action（`src/app/(auth)/login/actions.ts`）：
   ```typescript
   'use server';

   import { auth } from '@/lib/auth';
   import { redirect } from 'next/navigation';

   export async function login(formData: FormData) {
     const result = await auth.api.signInEmail({
       body: {
         email: formData.get('email') as string,
         password: formData.get('password') as string,
       },
     });

     if (!result) {
       return { error: '登录失败' };
     }

     redirect('/requests');
   }
   ```

3. 创建注册页面（`src/app/(auth)/register/page.tsx`）：
   - Email 输入框
   - Password 输入框
   - Display Name 输入框（可选）
   - 注册按钮
   - 登录链接

4. 创建注册 Server Action（`src/app/(auth)/register/actions.ts`）

5. 创建等待激活页面（`src/app/(auth)/pending/page.tsx`）：
   - 显示"您的账号正在等待管理员激活"
   - 登出按钮

6. 创建无权限页面（`src/app/(auth)/forbidden/page.tsx`）：
   - 显示"您没有权限访问此页面"
   - 返回按钮
   - 登出按钮

7. 创建认证布局（`src/app/(auth)/layout.tsx`）：
   - 居中卡片布局
   - 统一样式

#### 产出文件

- `apps/console/src/app/(auth)/layout.tsx`
- `apps/console/src/app/(auth)/login/page.tsx`
- `apps/console/src/app/(auth)/login/actions.ts`
- `apps/console/src/app/(auth)/register/page.tsx`
- `apps/console/src/app/(auth)/register/actions.ts`
- `apps/console/src/app/(auth)/pending/page.tsx`
- `apps/console/src/app/(auth)/forbidden/page.tsx`

#### 验收标准

- [x] 可以成功注册新用户
- [x] 新用户注册后自动跳转到 /pending
- [x] 可以成功登录已激活用户
- [x] 登录后跳转到 /requests
- [x] 登出后跳转到 /login
