# 执行流程

## 1. 执行权限

**MVP 阶段：仅 ADMIN 可执行**

后续如需开放给 USER 执行，需增加 feature flag。

## 2. 执行前提

- 请求状态为 APPROVED
- 未超过 24 小时有效期
- 执行人为 ADMIN

## 3. 两阶段执行模型

### 3.1 阶段一：预检

```
Admin 点击执行
        │
        ▼
遍历包含写操作的语句
        │
        ▼
调用 Executor 执行预检 SQL
        │
        ▼
返回影响行数
        │
        ▼
展示给用户确认
```

### 3.2 阶段二：执行

```
用户确认影响行数
        │
        ├── 行数 > 1000 → 额外确认
        │
        ▼
输入确认信息
        │
        ▼
调用 Executor 执行实际 SQL
        │
        ▼
记录执行结果
```

## 4. 确认机制

### 4.1 基本确认

用户需要输入：
- 请求 ID（防误点）
- `CONFIRM` 字符串
- 期望影响行数（整数或范围，如 `50` 或 `10-20`）

### 4.2 大批量确认

当预检结果 > 1000 行时，额外要求：
- 输入 `CONFIRM_LARGE_CHANGE`
- 填写原因（reason）

原因会写入审计日志。

### 4.3 行数校验

执行前再次执行预检，对比：
- 如果实际行数与用户输入不符 → 拒绝执行
- 如果实际行数与首次预检不符 → 警告并要求重新确认

## 5. 多语句串行执行

### 5.1 执行规则

- 按 `order_index` 顺序逐条执行
- **默认不包事务**（每条独立执行）
- 上一条成功后才执行下一条
- 上一条失败则**终止后续**

### 5.2 失败处理

```
语句 1 ── 成功 ──→ 语句 2 ── 成功 ──→ 语句 3 ── 失败
                                         │
                                         ▼
                               语句 4, 5... 标记为 SKIPPED
                                         │
                                         ▼
                               请求状态 → FAILED
```

### 5.3 语句状态更新

```typescript
async function executeStatements(versionId: string) {
  const statements = await getStatements(versionId);

  for (const stmt of statements) {
    // 更新状态为 EXECUTING
    await updateStatementStatus(stmt.id, 'EXECUTING');

    try {
      const result = await callExecutor(stmt);

      // 更新状态为 SUCCEEDED
      await updateStatementResult(stmt.id, {
        exec_status: 'SUCCEEDED',
        exec_result: result,
        duration_ms: result.durationMs,
        process_id: result.processId,
        executed_at: new Date(),
      });
    } catch (error) {
      // 更新状态为 FAILED
      await updateStatementResult(stmt.id, {
        exec_status: 'FAILED',
        exec_result: { error: error.message },
        executed_at: new Date(),
      });

      // 标记后续语句为 SKIPPED
      await skipRemainingStatements(versionId, stmt.order_index);

      // 更新请求状态
      await updateRequestStatus(requestId, 'FAILED');

      throw error;
    }
  }

  // 全部成功
  await updateRequestStatus(requestId, 'SUCCEEDED');
}
```

## 6. 执行超时

### 6.1 默认超时

```typescript
const DEFAULT_TIMEOUT_MS = 30000; // 30 秒
```

### 6.2 可调整超时

Admin 可在执行界面选择超时时间：
- 30 秒（默认）
- 60 秒
- 120 秒（上限）

超时变更写入审计日志。

### 6.3 超时处理

- Executor 超时返回错误
- Console 标记语句为 FAILED
- 后续语句标记为 SKIPPED

## 7. 结果集限制

### 7.1 SELECT 结果

```typescript
const MAX_RESULT_ROWS = 200;
const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1MB
```

- 默认返回前 200 行
- 返回总行数（若可得）
- 超过则标记 `truncated: true`
- 单次 payload 超过 1MB 则截断

### 7.2 写操作结果

仅返回 `affectedRows`。

## 8. 执行结果记录

### 8.1 语句级记录

每条语句执行后记录：
- `exec_status`: 执行状态
- `exec_result`: 执行结果（JSON）
- `process_id`: MySQL process id
- `duration_ms`: 执行耗时
- `executed_by`: 执行人
- `executed_at`: 执行时间

### 8.2 审计日志

每条语句执行都写入 audit_logs：

```typescript
await writeAuditLog({
  action: 'statement.execute',
  target_type: 'statement',
  target_id: statement.id,
  payload: {
    request_id: requestId,
    version_id: versionId,
    sql_text: statement.sql_text, // SQL 快照
    result: result,
    process_id: result.processId,
    duration_ms: result.durationMs,
  },
});
```

## 9. 执行流程时序图

```
Admin          Console            Executor           PolarDB
  │                │                  │                  │
  │─[点击执行]────→│                  │                  │
  │                │                  │                  │
  │                │──[预检请求]─────→│                  │
  │                │                  │──[SELECT COUNT]─→│
  │                │                  │←─[count: 50]────│
  │                │←─[行数: 50]─────│                  │
  │                │                  │                  │
  │←─[显示确认框]──│                  │                  │
  │                │                  │                  │
  │─[输入确认]────→│                  │                  │
  │                │                  │                  │
  │                │──[执行请求]─────→│                  │
  │                │                  │──[执行 SQL]────→│
  │                │                  │←─[结果]─────────│
  │                │←─[执行结果]─────│                  │
  │                │                  │                  │
  │                │──[写审计日志]───│                  │
  │                │                  │                  │
  │←─[执行完成]────│                  │                  │
```

## 10. 中断执行

### 10.1 Kill 会话

执行过程中，Admin 可以：
1. 查看当前执行的 processId
2. 调用 kill 接口终止会话

### 10.2 终止处理

```typescript
async function terminateExecution(requestId: string, reason: string) {
  // 1. 获取当前正在执行的语句
  const executingStmt = await getCurrentExecutingStatement(requestId);

  if (executingStmt && executingStmt.process_id) {
    // 2. 调用 Executor kill 会话
    await callExecutorKill(executingStmt.process_id, reason);
  }

  // 3. 更新语句状态
  await updateStatementResult(executingStmt.id, {
    exec_status: 'FAILED',
    exec_result: { error: 'Terminated by user', reason },
  });

  // 4. 标记后续语句为 SKIPPED
  await skipRemainingStatements(versionId, executingStmt.order_index);

  // 5. 更新请求状态
  await updateRequestStatus(requestId, 'TERMINATED');

  // 6. 写入审计日志
  await writeAuditLog({
    action: 'request.terminate',
    target_type: 'request',
    target_id: requestId,
    payload: { reason, process_id: executingStmt.process_id },
  });
}
```

## 11. 执行界面组件

### 11.1 执行按钮

- 状态为 APPROVED 时显示
- 检查是否过期
- 仅 ADMIN 可见

### 11.2 预检结果展示

```
┌─────────────────────────────────────────────┐
│ 预检结果                                     │
├─────────────────────────────────────────────┤
│ 语句 #2: UPDATE users SET status = ...      │
│ 预计影响: 50 行                              │
├─────────────────────────────────────────────┤
│ 语句 #4: DELETE FROM logs WHERE ...         │
│ 预计影响: 1,234 行 ⚠️ 超过 1000 行           │
└─────────────────────────────────────────────┘
```

### 11.3 确认对话框

```
┌─────────────────────────────────────────────┐
│ 确认执行                                     │
├─────────────────────────────────────────────┤
│ 请输入请求 ID: [________________]           │
│                                             │
│ 请输入 CONFIRM: [________________]          │
│                                             │
│ 期望影响行数: [________________]            │
│                                             │
│ ⚠️ 此操作包含大批量修改 (1,234 行)          │
│ 请输入 CONFIRM_LARGE_CHANGE: [____________] │
│ 原因: [________________________________]    │
│                                             │
│        [取消]  [确认执行]                    │
└─────────────────────────────────────────────┘
```

### 11.4 执行进度

```
┌─────────────────────────────────────────────┐
│ 执行进度                                     │
├─────────────────────────────────────────────┤
│ ✓ 语句 #1: SELECT ... (1.2s)               │
│ ✓ 语句 #2: UPDATE ... (0.8s) - 50 rows     │
│ ◐ 语句 #3: SELECT ... 执行中...             │
│ ○ 语句 #4: DELETE ...                       │
│                                             │
│        [终止执行]                            │
└─────────────────────────────────────────────┘
```
