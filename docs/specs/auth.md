# 认证与权限

## 1. 角色定义

| 角色 | 权限 |
|------|------|
| PENDING | 注册未激活，无法进入后台，只能访问 /pending 页面 |
| USER | 普通用户，可创建请求、查看自己的请求与结果 |
| ADMIN | 管理员，拥有所有权限 |

### ADMIN 特有权限

- 审批/驳回请求
- 执行已审批的请求
- 管理用户（激活、暂停、角色变更）
- 查看全部审计日志
- 管理 SQL 模板
- 查看和 kill 数据库会话

## 2. 用户状态

| 状态 | 说明 |
|------|------|
| ACTIVE | 正常状态 |
| SUSPENDED | 已暂停，无法登录和操作 |

## 3. 注册流程

```
用户填写注册表单
        │
        ▼
Better Auth 创建用户
        │
        ▼
自动创建 profile
(role=PENDING, status=ACTIVE)
        │
        ▼
重定向到 /pending 页面
        │
        ▼
等待 Admin 激活
```

### 3.1 注册表单字段

- Email（必填）
- Password（必填，最少 8 位）
- Display Name（可选）

### 3.2 触发器逻辑

```sql
-- 用户注册时自动创建 profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 4. 登录流程

```
用户填写登录表单
        │
        ▼
Better Auth 验证
        │
        ├── 失败 → 显示错误信息
        │
        ▼ 成功
查询 profiles 表
        │
        ├── role = PENDING → 重定向 /pending
        │
        ├── status = SUSPENDED → 重定向 /forbidden
        │
        ▼ ACTIVE 且 role ≠ PENDING
进入系统主页
```

## 5. 路由保护

### 5.1 中间件配置

```typescript
// middleware.ts
const publicPaths = ['/login', '/register', '/pending', '/forbidden'];
const adminPaths = ['/admin'];
const userPaths = ['/requests'];
```

### 5.2 访问控制矩阵

| 路径 | PENDING | USER | ADMIN | 未登录 |
|------|---------|------|-------|--------|
| /login | ✓ | ✓ | ✓ | ✓ |
| /register | ✓ | ✓ | ✓ | ✓ |
| /pending | ✓ | ✓ | ✓ | ✗ |
| /forbidden | ✓ | ✓ | ✓ | ✗ |
| /requests | ✗ | ✓ | ✓ | ✗ |
| /requests/new | ✗ | ✓ | ✓ | ✗ |
| /requests/[id] | ✗ | ✓* | ✓ | ✗ |
| /admin/* | ✗ | ✗ | ✓ | ✗ |

> *USER 只能访问自己创建的请求

### 5.3 中间件逻辑

```typescript
export async function middleware(request: NextRequest) {
  // 1. 检查是否是公共路径
  if (isPublicPath(pathname)) {
    return next();
  }

  // 2. 检查用户是否已登录
  const user = await getUser();
  if (!user) {
    return redirect('/login');
  }

  // 3. 获取用户 profile
  const profile = await getProfile(user.id);

  // 4. 检查用户状态
  if (profile.role === 'PENDING') {
    return redirect('/pending');
  }
  if (profile.status === 'SUSPENDED') {
    return redirect('/forbidden');
  }

  // 5. 检查 Admin 路径权限
  if (isAdminPath(pathname) && profile.role !== 'ADMIN') {
    return redirect('/forbidden');
  }

  return next();
}
```

## 6. 用户管理（Admin）

### 6.1 激活用户

将 PENDING 用户激活为 USER。

```typescript
async function activateUser(userId: string) {
  await db.update(profiles)
    .set({
      role: 'USER',
      activated_at: new Date(),
      activated_by: currentUser.id,
    })
    .where(eq(profiles.id, userId));

  await writeAuditLog({
    action: 'user.activate',
    target_type: 'user',
    target_id: userId,
  });
}
```

### 6.2 暂停用户

将用户状态设为 SUSPENDED，立即生效。

```typescript
async function suspendUser(userId: string) {
  await db.update(profiles)
    .set({ status: 'SUSPENDED' })
    .where(eq(profiles.id, userId));

  await writeAuditLog({
    action: 'user.suspend',
    target_type: 'user',
    target_id: userId,
  });
}
```

### 6.3 恢复用户

将 SUSPENDED 用户恢复为 ACTIVE。

### 6.4 角色变更

USER ↔ ADMIN 互转。

## 7. 会话管理

### 7.1 登出

调用 Better Auth signOut 方法，清除会话。

### 7.2 会话过期

Better Auth 会话过期时间可配置，通过自动续期机制保持登录状态。

## 8. 安全注意事项

### 8.1 中间件不是唯一防线

> 参考 CVE-2025-29927：Next.js 中间件可能被绕过

中间件仅用于路由重定向，真正的权限校验必须在：
- Server Components 中再次检查用户权限
- Server Actions 中验证用户权限
- API Routes 中验证用户权限

### 8.2 数据访问控制

通过应用层权限检查确保用户只能访问授权的数据。

### 8.3 敏感操作审计

所有用户状态变更、角色变更都必须写入 audit_logs。
