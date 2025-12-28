# 数据模型设计

## 1. ER 关系图

```
┌──────────────┐
│   profiles   │
│──────────────│
│ id (PK)      │←─────────────────────────────────────────────┐
│ email        │                                              │
│ role         │                                              │
│ status       │                                              │
└──────────────┘                                              │
       │                                                      │
       │ created_by                                           │
       ▼                                                      │
┌──────────────┐       ┌──────────────┐                      │
│   services   │       │  db_targets  │                      │
│──────────────│       │──────────────│                      │
│ id (PK)      │←──────│ service_id   │                      │
│ name         │       │ id (PK)      │←─────┐               │
│ region       │       │ db_type      │      │               │
└──────────────┘       │ db_role      │      │               │
                       └──────────────┘      │               │
                                             │               │
┌──────────────────────────────────────────────────────────────────────┐
│                           sql_requests                                │
│──────────────────────────────────────────────────────────────────────│
│ id (PK)                                                               │
│ target_id (FK) ──────────────────────────────────────────────────────┘
│ created_by (FK) ─────────────────────────────────────────────────────┘
│ title                                                                 │
│ description                                                           │
│ status                                                                │
│ current_version_id (FK) ────┐                                        │
│ approved_version_id (FK) ───┼───────────┐                            │
│ expires_at                   │           │                            │
└──────────────────────────────┼───────────┼────────────────────────────┘
                               │           │
       ┌───────────────────────┘           │
       ▼                                   │
┌─────────────────────┐                    │
│ sql_request_versions│                    │
│─────────────────────│                    │
│ id (PK)             │←───────────────────┘
│ request_id (FK)     │←───────────────────────────────────────────────┐
│ version             │                                                │
│ sql_raw             │                                                │
│ validation_result   │                                                │
│ template_snapshot   │                                                │
└─────────────────────┘                                                │
       │                                                               │
       │ version_id                                                    │
       ▼                                                               │
┌─────────────────────┐      ┌──────────────┐                         │
│   sql_statements    │      │  approvals   │                         │
│─────────────────────│      │──────────────│                         │
│ id (PK)             │      │ id (PK)      │                         │
│ version_id (FK)     │      │ request_id   │─────────────────────────┘
│ order_index         │      │ version_id   │
│ sql_text            │      │ decision     │
│ type                │      │ comment      │
│ precheck_sql        │      │ decided_by   │
│ exec_status         │      └──────────────┘
│ exec_result         │
└─────────────────────┘

┌──────────────┐      ┌──────────────┐
│ audit_logs   │      │ sql_templates│
│──────────────│      │──────────────│
│ id (PK)      │      │ id (PK)      │
│ actor_id     │      │ name         │
│ action       │      │ db_type      │
│ target_type  │      │ sql_text     │
│ target_id    │      │ tags         │
│ payload      │      │ enabled      │
│ created_at   │      └──────────────┘
└──────────────┘
```

## 2. 表结构定义

### 2.1 profiles（用户资料）

存储用户业务信息。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 关联 users.id（Better Auth 用户表） |
| email | text | 是 | 邮箱 |
| display_name | text | 否 | 显示名称 |
| role | enum | 是 | PENDING / USER / ADMIN |
| status | enum | 是 | ACTIVE / SUSPENDED |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |
| activated_at | timestamp | 否 | 激活时间 |
| activated_by | uuid | FK | 激活操作人 |

### 2.2 services（服务定义）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| name | text | 是 | 服务名称（如"美国一服"） |
| region | text | 是 | 地域 |
| enabled | boolean | 是 | 是否启用 |
| created_at | timestamp | 是 | 创建时间 |
| created_by | uuid | FK | 创建人 |

### 2.3 db_targets（数据库目标）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| service_id | uuid | FK | 所属服务 |
| db_type | enum | 是 | polardb_mysql / adb / redis |
| db_role | text | 是 | primary / record / db index |
| display_name | text | 是 | 显示名称 |
| enabled | boolean | 是 | 是否启用 |
| created_at | timestamp | 是 | 创建时间 |

> 注意：数据库连接信息（host、port、user、password）存储在 Executor 环境变量中，不在此表中。

### 2.4 sql_requests（SQL 请求）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| target_id | uuid | FK | 目标数据库 |
| created_by | uuid | FK | 创建人 |
| title | text | 是 | 请求标题 |
| description | text | 否 | 请求描述 |
| status | enum | 是 | 请求状态 |
| current_version_id | uuid | FK | 当前版本 |
| approved_version_id | uuid | FK | 已审批版本 |
| expires_at | timestamp | 否 | 审批过期时间 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

**状态枚举值：**
- PENDING_APPROVAL
- CHANGES_REQUESTED
- REJECTED
- APPROVED
- APPROVAL_EXPIRED
- EXECUTING
- SUCCEEDED
- FAILED
- TERMINATED

### 2.5 sql_request_versions（请求版本）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| request_id | uuid | FK | 所属请求 |
| version | integer | 是 | 版本号（从 1 开始） |
| sql_raw | text | 是 | 原始 SQL 文本 |
| validation_result | jsonb | 是 | 校验结果 |
| template_id | uuid | FK | 使用的模板（可选） |
| template_snapshot | jsonb | 否 | 模板快照 |
| created_by | uuid | FK | 创建人 |
| created_at | timestamp | 是 | 创建时间 |

### 2.6 sql_statements（SQL 语句）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| version_id | uuid | FK | 所属版本 |
| order_index | integer | 是 | 执行顺序（从 0 开始） |
| sql_text | text | 是 | SQL 语句文本 |
| type | enum | 是 | select / update / delete |
| precheck_sql | text | 否 | 预检 SQL（写操作必填） |
| validation_result | jsonb | 是 | 校验结果 |
| exec_status | enum | 否 | 执行状态 |
| exec_result | jsonb | 否 | 执行结果 |
| process_id | bigint | 否 | MySQL process id |
| duration_ms | integer | 否 | 执行耗时（毫秒） |
| executed_by | uuid | FK | 执行人 |
| executed_at | timestamp | 否 | 执行时间 |

**类型枚举值：** select / update / delete

**执行状态枚举值：** PENDING / EXECUTING / SUCCEEDED / FAILED / SKIPPED

### 2.7 approvals（审批记录）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| request_id | uuid | FK | 请求 ID |
| version_id | uuid | FK | 版本 ID |
| decision | enum | 是 | 审批决策 |
| comment | text | 否 | 审批意见（驳回/修改时必填） |
| decided_by | uuid | FK | 审批人 |
| created_at | timestamp | 是 | 审批时间 |

**决策枚举值：** APPROVE / REJECT / CHANGES_REQUESTED

### 2.8 audit_logs（审计日志）

**只能 INSERT，禁止 UPDATE/DELETE**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| actor_user_id | uuid | FK | 操作人 |
| action | text | 是 | 操作类型 |
| target_type | text | 是 | 目标类型 |
| target_id | uuid | 否 | 目标 ID |
| payload | jsonb | 否 | 操作详情 |
| ip_address | text | 否 | IP 地址 |
| user_agent | text | 否 | User Agent |
| created_at | timestamp | 是 | 操作时间 |

**常见 action 值：**
- `request.create` - 创建请求
- `request.update` - 更新请求
- `version.create` - 创建版本
- `approval.approve` - 审批通过
- `approval.reject` - 审批驳回
- `approval.changes_requested` - 要求修改
- `statement.execute` - 执行语句
- `session.kill` - Kill 会话
- `user.activate` - 激活用户
- `user.suspend` - 暂停用户
- `template.create` - 创建模板
- `template.update` - 更新模板

### 2.9 sql_templates（SQL 模板）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | PK | 主键 |
| name | text | 是 | 模板名称 |
| description | text | 否 | 模板描述 |
| db_type | enum | 是 | 适用的数据库类型 |
| tags | text[] | 否 | 标签 |
| sql_text | text | 是 | 模板 SQL |
| enabled | boolean | 是 | 是否启用 |
| created_by | uuid | FK | 创建人 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

## 3. RLS 策略

### 3.1 profiles

```sql
-- 用户只能查看自己的 profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admin 可以查看所有 profile
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (get_user_role() = 'ADMIN');

-- Admin 可以更新任何 profile
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (get_user_role() = 'ADMIN');
```

### 3.2 sql_requests

```sql
-- 用户只能查看自己创建的请求
CREATE POLICY "Users can view own requests" ON sql_requests
  FOR SELECT USING (created_by = auth.uid());

-- Admin 可以查看所有请求
CREATE POLICY "Admins can view all requests" ON sql_requests
  FOR SELECT USING (get_user_role() = 'ADMIN');

-- 活跃用户可以创建请求
CREATE POLICY "Active users can create requests" ON sql_requests
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND get_user_role() IN ('USER', 'ADMIN')
  );
```

### 3.3 audit_logs

```sql
-- 只允许 Admin 查看
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (get_user_role() = 'ADMIN');

-- 只允许 INSERT（通过 service role）
CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- 禁止 UPDATE 和 DELETE（不创建对应策略）
```

## 4. 数据库函数

### 4.1 获取用户角色

```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 4.2 创建用户 Profile（触发器）

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'PENDING',
    'ACTIVE'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 5. 索引建议

```sql
-- 常用查询索引
CREATE INDEX idx_requests_created_by ON sql_requests(created_by);
CREATE INDEX idx_requests_status ON sql_requests(status);
CREATE INDEX idx_requests_target_id ON sql_requests(target_id);

CREATE INDEX idx_versions_request_id ON sql_request_versions(request_id);

CREATE INDEX idx_statements_version_id ON sql_statements(version_id);

CREATE INDEX idx_approvals_request_id ON approvals(request_id);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```
