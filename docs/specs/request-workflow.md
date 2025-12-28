# 请求工作流

## 1. 状态机

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌─────────────────────────┐                                   │
│    PENDING_APPROVAL     │──────────────────────────────┐    │
│       (待审批)          │                              │    │
└───────────┬─────────────┘                              │    │
            │                                            │    │
   ┌────────┼────────┬───────────────┐                  │    │
   │        │        │               │                  │    │
   ▼        ▼        ▼               │                  │    │
┌──────┐ ┌──────┐ ┌─────────────────┐│                  │    │
│APPROVE│ │REJECT│ │CHANGES_REQUESTED││                  │    │
└───┬───┘ └───┬──┘ └────────┬───────┘│                  │    │
    │         │             │        │                  │    │
    │         │             │        │                  │    │
    │         ▼             ▼        │                  │    │
    │    ┌─────────┐   ┌─────────────┴───┐              │    │
    │    │ REJECTED │   │ (用户修改 SQL)  │              │    │
    │    │  (已驳回) │   │  创建新版本     │──────────────┘    │
    │    └─────────┘   └─────────────────┘                   │
    │                                                        │
    ▼                                                        │
┌─────────────────────────┐                                  │
│       APPROVED          │                                  │
│    (已审批，待执行)      │                                  │
└───────────┬─────────────┘                                  │
            │                                                │
   ┌────────┴────────┐                                      │
   │                 │                                      │
   ▼                 ▼                                      │
┌──────────┐   ┌────────────────┐                           │
│ 24h 过期  │   │   点击执行     │                           │
└────┬─────┘   └───────┬────────┘                           │
     │                 │                                     │
     ▼                 ▼                                     │
┌────────────────┐  ┌─────────────────┐                     │
│APPROVAL_EXPIRED│  │    EXECUTING    │                     │
│  (审批已过期)   │  │    (执行中)     │                     │
└───────┬────────┘  └────────┬────────┘                     │
        │                    │                              │
        │           ┌────────┴────────┐                     │
        │           │                 │                     │
        │           ▼                 ▼                     │
        │    ┌───────────┐     ┌───────────┐               │
        │    │ SUCCEEDED │     │  FAILED   │               │
        │    │ (执行成功) │     │ (执行失败) │               │
        │    └───────────┘     └─────┬─────┘               │
        │                            │                      │
        │                            ▼                      │
        │                      ┌───────────┐               │
        │                      │TERMINATED │               │
        │                      │ (已终止)  │               │
        │                      └───────────┘               │
        │                                                   │
        └───────────────────────────────────────────────────┘
                        (重新修改并提交)
```

## 2. 状态说明

| 状态 | 说明 | 后续操作 |
|------|------|----------|
| PENDING_APPROVAL | 待审批 | Admin 审批 |
| CHANGES_REQUESTED | 需要修改 | User 修改 SQL 并重新提交 |
| REJECTED | 已驳回 | User 修改 SQL 并重新提交，或放弃 |
| APPROVED | 已审批 | Admin 执行，或等待过期 |
| APPROVAL_EXPIRED | 审批已过期 | User 重新提交审批 |
| EXECUTING | 执行中 | 等待执行完成 |
| SUCCEEDED | 执行成功 | 终态 |
| FAILED | 执行失败 | User 修改并重新提交 |
| TERMINATED | 已终止 | 被 kill，可重新提交 |

## 3. 版本管理规则

### 3.1 版本创建时机

- 首次创建请求 → version 1
- 修改 SQL 内容 → version + 1
- 修改标题/描述 → 不创建新版本

### 3.2 版本不可变性

已创建的版本内容**只读**，不允许修改。

### 3.3 审批绑定版本

审批针对特定 version：
- `approved_version_id` 记录被审批的版本
- 只能执行 `approved_version_id` 对应的版本
- 修改 SQL 后 `approved_version_id` 清空，需重新审批

### 3.4 当前版本

`current_version_id` 指向最新版本，用于：
- 展示请求详情
- 用户修改时的基础

## 4. 创建请求流程

```
用户填写表单
      │
      ├── title (必填)
      ├── description (可选)
      ├── service (必选)
      ├── dbType (必选)
      ├── dbRole/redisDbIndex (按类型必填)
      ├── sql_raw (必填)
      └── templateId (可选)
      │
      ▼
  SQL 拆分
      │
      ▼
  规则校验
      │
      ├── 校验失败 → 显示错误，不允许提交
      │
      ▼ 校验通过
写入数据库
      │
      ├── sql_requests (status = PENDING_APPROVAL)
      ├── sql_request_versions (version = 1)
      └── sql_statements (每条语句一行)
      │
      ▼
写入 audit_logs
      │
      ▼
  完成
```

## 5. 修改请求流程

### 5.1 允许修改的状态

- CHANGES_REQUESTED
- REJECTED
- APPROVAL_EXPIRED
- FAILED

### 5.2 修改流程

```
用户修改 SQL
      │
      ▼
  SQL 拆分
      │
      ▼
  规则校验
      │
      ├── 校验失败 → 显示错误
      │
      ▼ 校验通过
创建新版本
      │
      ├── sql_request_versions (version = n+1)
      └── sql_statements (新版本的语句)
      │
      ▼
更新请求
      │
      ├── current_version_id = 新版本 ID
      ├── approved_version_id = null
      └── status = PENDING_APPROVAL
      │
      ▼
写入 audit_logs
```

## 6. 审批流程

### 6.1 审批队列筛选

Admin 可按以下条件筛选：
- 状态（默认显示 PENDING_APPROVAL）
- Service
- DB Type
- 提交人
- 是否包含写操作
- 时间范围

### 6.2 审批动作

#### APPROVE（批准）

```typescript
async function approve(requestId: string, versionId: string) {
  // 1. 验证版本是当前版本
  // 2. 更新请求状态
  await db.update(sql_requests)
    .set({
      status: 'APPROVED',
      approved_version_id: versionId,
      expires_at: addHours(new Date(), 24),
    })
    .where(eq(sql_requests.id, requestId));

  // 3. 写入审批记录
  await db.insert(approvals).values({
    request_id: requestId,
    version_id: versionId,
    decision: 'APPROVE',
    decided_by: currentUser.id,
  });

  // 4. 写入审计日志
  await writeAuditLog({
    action: 'approval.approve',
    target_type: 'request',
    target_id: requestId,
    payload: { version_id: versionId },
  });
}
```

#### REJECT（驳回）

```typescript
async function reject(requestId: string, versionId: string, reason: string) {
  // reason 必填
  if (!reason) throw new Error('驳回必须填写原因');

  await db.update(sql_requests)
    .set({ status: 'REJECTED' })
    .where(eq(sql_requests.id, requestId));

  await db.insert(approvals).values({
    request_id: requestId,
    version_id: versionId,
    decision: 'REJECT',
    comment: reason,
    decided_by: currentUser.id,
  });

  await writeAuditLog({
    action: 'approval.reject',
    target_type: 'request',
    target_id: requestId,
    payload: { version_id: versionId, reason },
  });
}
```

#### CHANGES_REQUESTED（要求修改）

```typescript
async function requestChanges(requestId: string, versionId: string, comment: string) {
  // comment 必填
  if (!comment) throw new Error('修改意见必填');

  await db.update(sql_requests)
    .set({ status: 'CHANGES_REQUESTED' })
    .where(eq(sql_requests.id, requestId));

  await db.insert(approvals).values({
    request_id: requestId,
    version_id: versionId,
    decision: 'CHANGES_REQUESTED',
    comment: comment,
    decided_by: currentUser.id,
  });

  await writeAuditLog({
    action: 'approval.changes_requested',
    target_type: 'request',
    target_id: requestId,
    payload: { version_id: versionId, comment },
  });
}
```

## 7. 审批过期处理

### 7.1 过期规则

审批通过后 24 小时内未执行，状态自动变为 APPROVAL_EXPIRED。

### 7.2 定时任务

```typescript
// 定时任务 - 每 5 分钟执行
async function expireApprovals() {
  const expiredRequests = await db
    .select()
    .from(sql_requests)
    .where(
      and(
        eq(sql_requests.status, 'APPROVED'),
        lt(sql_requests.expires_at, new Date())
      )
    );

  for (const request of expiredRequests) {
    await db.update(sql_requests)
      .set({ status: 'APPROVAL_EXPIRED' })
      .where(eq(sql_requests.id, request.id));

    await writeAuditLog({
      action: 'request.expired',
      target_type: 'request',
      target_id: request.id,
      payload: { reason: '24h approval window expired' },
    });
  }
}
```

## 8. 列表展示字段

### 8.1 请求列表

| 字段 | 说明 |
|------|------|
| 标题 | request.title |
| 状态 | request.status（带颜色标记） |
| 目标 | service.name + db_target.display_name |
| 是否写操作 | 包含 UPDATE/DELETE 则显示标记 |
| 创建时间 | request.created_at |
| 当前版本 | version.version |
| 创建人 | profiles.display_name（仅 Admin 可见） |

### 8.2 请求详情

| 区块 | 内容 |
|------|------|
| 基本信息 | 标题、描述、目标、创建人、创建时间 |
| 状态信息 | 当前状态、审批过期时间（如有） |
| 版本历史 | 版本号、创建时间、创建人 |
| 语句列表 | 顺序、SQL、类型、校验结果、预检SQL |
| 审批记录 | 审批人、决策、意见、时间 |
| 执行结果 | 状态、结果、耗时（已执行时） |
