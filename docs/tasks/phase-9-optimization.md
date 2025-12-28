# 阶段九：优化与增强

本阶段基于 MVP 完成后的全面代码分析，整理了界面优化、数据同步、功能完整性和安全增强等方面的任务。

## 任务状态图例

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成

## 阶段概述

| 任务组 | 说明 | 任务数 | 完成数 | 进度 |
|-------|------|--------|--------|------|
| **CRIT** | **关键问题修复（安全/稳定性）** | **25** | **8** | **32%** |
| UI | 界面美化与交互增强 | 8 | 3 | 38% |
| SYNC | 数据实时同步 | 5 | 2 | 40% |
| FEAT | 功能完整性 | 4 | 0 | 0% |
| SEC | 安全与运维增强 | 5 | 0 | 0% |
| **总计** | | **47** | **13** | **28%** |

---

## 任务依赖关系图

```
关键修复流（CRIT - 最高优先级）:

流 CRIT-P0 (致命问题):  CRIT-01 → CRIT-02 → CRIT-03 → CRIT-04
流 CRIT-P1 (严重问题):  CRIT-05 → CRIT-06 → CRIT-07 → CRIT-08 → CRIT-09 → CRIT-10
流 CRIT-P2 (中等问题):  CRIT-11 ~ CRIT-18（可并行）
流 CRIT-P3 (低优先级):  CRIT-19 ~ CRIT-25（可并行）

独立开发流（可并行）:

流 A (UI 界面):     UI-01 → UI-02 → UI-07
流 B (UI 搜索):     UI-03 → UI-04 → UI-08
流 C (UI 工具):     UI-05 → UI-06
流 D (数据同步):    SYNC-01 → SYNC-02 → SYNC-04
流 E (执行同步):    SYNC-03 → SYNC-05
流 F (功能增强):    FEAT-01 → FEAT-02
流 G (会话功能):    FEAT-03 → FEAT-04
流 H (安全基础):    SEC-01 → SEC-02 → SEC-05
流 I (安全验证):    SEC-03 → SEC-04

跨组依赖:
  CRIT-04 依赖 Executor API 实现（KILL SESSION 端点）
  CRIT-08 和 CRIT-25 需要数据库迁移
  SYNC-02 依赖 SYNC-01（需要先完成 SWR 设置）
  UI-02 可与 SYNC-02 配合实现实时倒计时
  FEAT-03 受益于 SYNC-04（会话刷新）
```

---

## 🚨 CRIT 关键问题修复（最高优先级）

本节包含通过全面代码分析发现的关键问题，涉及安全漏洞、数据完整性和核心功能缺陷。

### P0 致命问题（必须立即修复）

#### T-CRIT-01: 空签名密钥安全漏洞

- **状态**: `[ ]` 未开始
- **优先级**: P0 - 致命
- **分支**: `happyboy2022/crit-01-signing-secret`
- **依赖**: 无

**问题描述**:
当 `EXECUTOR_SIGNING_SECRET` 未配置时，代码静默回退到空字符串，导致 HMAC 签名完全失效。

**涉及文件**:
- `apps/console/src/lib/executor/signing.ts:45-46`

**当前代码**:
```typescript
if (!secret) {
  console.warn('EXECUTOR_SIGNING_SECRET not configured, using empty secret');
  return '';  // ← 致命：使用空密钥签名！
}
```

**修复方案**:
```typescript
if (!secret) {
  throw new Error('EXECUTOR_SIGNING_SECRET is required but not configured');
}
```

**验收标准**:
- [ ] 缺少签名密钥时抛出错误而非回退
- [ ] 启动时验证环境变量配置
- [ ] 错误消息明确指出问题

---

#### T-CRIT-02: SQL 查询数据丢失 BUG

- **状态**: `[ ]` 未开始
- **优先级**: P0 - 致命
- **分支**: `happyboy2022/crit-02-inarray-query`
- **依赖**: 无

**问题描述**:
请求详情查询使用 `eq()` 替代 `inArray()` 导致只返回第一条记录，多版本请求数据丢失。

**涉及文件**:
- `apps/console/src/lib/queries/request-detail.ts:223, 241`

**当前代码**:
```typescript
.where(eq(sqlStatements.versionId, versionIds[0])) // BUG: 只获取第一个！
.where(eq(profiles.id, executorIds[0])) // BUG: 只获取第一个执行者！
```

**修复方案**:
```typescript
.where(inArray(sqlStatements.versionId, versionIds))
.where(inArray(profiles.id, executorIds))
```

**验收标准**:
- [ ] 多版本请求显示所有版本的语句
- [ ] 审计日志显示所有执行者信息
- [ ] 添加单元测试覆盖多版本场景

---

#### T-CRIT-03: Executor 客户端无响应状态检查

- **状态**: `[ ]` 未开始
- **优先级**: P0 - 致命
- **分支**: `happyboy2022/crit-03-executor-client`
- **依赖**: 无

**问题描述**:
Executor 客户端不检查 HTTP 响应状态直接解析 JSON，500 错误时会尝试将 HTML 解析为 JSON。

**涉及文件**:
- `apps/console/src/lib/executor/client.ts:126-140`

**当前代码**:
```typescript
const response = await fetch(...);
const result = await response.json();  // ← 不检查 response.ok！
```

**修复方案**:
```typescript
const response = await fetch(...);
if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
}
const result = await response.json();
```

**验收标准**:
- [ ] 非 2xx 响应正确抛出错误
- [ ] 错误消息包含状态码和响应内容
- [ ] 添加测试覆盖各种错误场景

---

#### T-CRIT-04: 进程终止功能未实现

- **状态**: `[ ]` 未开始
- **优先级**: P0 - 致命
- **分支**: `happyboy2022/crit-04-process-termination`
- **依赖**: 无

**问题描述**:
`terminateExecution()` 函数只标记数据库状态，不实际终止 MySQL 进程，长时间运行的 SQL 无法被真正终止。

**涉及文件**:
- `apps/console/src/lib/execution/statement-executor.ts:439`
- 新建: `apps/executor/src/routes/kill.ts`

**修复方案**:
1. Executor 添加 KILL 端点
2. Console 调用 Executor API 执行 `KILL QUERY {processId}`
3. 标记数据库状态为 TERMINATED

**验收标准**:
- [ ] 终止按钮实际终止 MySQL 进程
- [ ] 终止操作记录审计日志
- [ ] 处理进程已结束的边界情况

---

### P1 严重问题（影响核心功能）

#### T-CRIT-05: Nonce 缓存非 Redis 备份

- **状态**: `[ ]` 未开始
- **优先级**: P1 - 严重
- **分支**: `happyboy2022/crit-05-nonce-redis`
- **依赖**: 无

**问题描述**:
Nonce 缓存仅存在于内存中，多实例部署时无法共享状态，允许跨实例重放攻击。

**涉及文件**:
- `apps/executor/src/middleware/signing.ts:25`

**修复方案**:
使用 Redis 存储 nonce（如可用），内存作为降级方案。

**验收标准**:
- [ ] Redis 可用时使用 Redis 存储 nonce
- [ ] Redis 不可用时降级为内存存储
- [ ] 添加警告日志说明降级情况

---

#### T-CRIT-06: Redis 可用性永久缓存

- **状态**: `[ ]` 未开始
- **优先级**: P1 - 严重
- **分支**: `happyboy2022/crit-06-redis-availability`
- **依赖**: 无

**问题描述**:
Redis 可用性检查结果被永久缓存，Redis 故障后无法恢复。

**涉及文件**:
- `apps/executor/src/services/process-tracker.ts:47-70`

**修复方案**:
实现带 TTL 的缓存（如 5 分钟），定期重新检查 Redis 可用性。

**验收标准**:
- [ ] Redis 可用性缓存有 TTL（5 分钟）
- [ ] Redis 恢复后自动重新连接
- [ ] 添加健康检查日志

---

#### T-CRIT-07: URL 解析无验证

- **状态**: `[ ]` 未开始
- **优先级**: P1 - 严重
- **分支**: `happyboy2022/crit-07-url-validation`
- **依赖**: 无

**问题描述**:
解析数据库连接 URL 后不验证必填字段，可能导致运行时错误。

**涉及文件**:
- `apps/executor/src/lib/url-parser.ts:35-50`

**修复方案**:
添加必填字段验证（host, user, database）。

**验收标准**:
- [ ] 必填字段为空时返回 null 或抛出错误
- [ ] 错误消息明确指出缺失的字段
- [ ] 添加单元测试覆盖边界情况

---

#### T-CRIT-08: 审计日志外键约束缺失

- **状态**: `[ ]` 未开始
- **优先级**: P1 - 严重
- **分支**: `happyboy2022/crit-08-audit-fk`
- **依赖**: 无

**问题描述**:
`actorUserId` 允许 NULL，无 onDelete 处理，审计追踪可能不完整。

**涉及文件**:
- `apps/console/src/db/schema/audit-logs.ts:8`

**修复方案**:
根据业务需求决定：
- 选项 A: 改为 NOT NULL + onDelete: 'restrict'（禁止删除有审计记录的用户）
- 选项 B: 保持 NULL 但添加 onDelete: 'set null'（用户删除后设为 NULL）

**验收标准**:
- [ ] 生成数据库迁移文件
- [ ] 迁移不破坏现有数据
- [ ] 添加相关单元测试

---

#### T-CRIT-09: 语句状态转换未定义

- **状态**: `[ ]` 未开始
- **优先级**: P1 - 严重
- **分支**: `happyboy2022/crit-09-statement-transitions`
- **依赖**: 无

**问题描述**:
请求状态有转换定义，但语句状态没有，无法验证有效的状态转换。

**涉及文件**:
- `packages/shared/src/constants/status.ts`

**修复方案**:
添加 `STATEMENT_STATUS_TRANSITIONS` 定义：
```typescript
export const STATEMENT_STATUS_TRANSITIONS: Record<StatementStatus, StatementStatus[]> = {
  PENDING: ['EXECUTING', 'SKIPPED'],
  EXECUTING: ['SUCCEEDED', 'FAILED', 'TERMINATED'],
  SUCCEEDED: [],
  FAILED: [],
  SKIPPED: [],
  TERMINATED: [],
};
```

**验收标准**:
- [ ] 定义所有有效的语句状态转换
- [ ] 添加验证函数 `canTransitionStatementTo()`
- [ ] 在状态更新前验证转换有效性

---

#### T-CRIT-10: COMMIT 正则绕过漏洞

- **状态**: `[ ]` 未开始
- **优先级**: P1 - 严重
- **分支**: `happyboy2022/crit-10-commit-regex`
- **依赖**: 无

**问题描述**:
`COMMIT -- comment` 可以绕过 COMMIT 检测，负向前瞻逻辑有缺陷。

**涉及文件**:
- `packages/shared/src/validators/forbidden-detector.ts:94`

**当前代码**:
```typescript
pattern: /\bCOMMIT\b(?!\s+--)/i,  // 负向前瞻允许 "COMMIT -- xxx"
```

**修复方案**:
移除负向前瞻，直接匹配 COMMIT：
```typescript
pattern: /\bCOMMIT\b/i,
```

**验收标准**:
- [ ] `COMMIT -- comment` 被正确拦截
- [ ] 添加测试覆盖各种 COMMIT 变体
- [ ] 同时检查 ROLLBACK 模式

---

### P2 中等问题

#### T-CRIT-11: 健康检查无超时

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-11-health-timeout`
- **依赖**: 无

**涉及文件**: `apps/executor/src/routes/health.ts:46`, `apps/executor/src/routes/sessions.ts`

**问题**: 健康检查 `SELECT 1` 没有超时设置，可能导致请求无限等待。

**修复**: 添加 5 秒超时设置。

**完成说明**: health.ts 已有超时实现，sessions.ts 已添加 `SESSION_QUERY_TIMEOUT_MS = 5000` 常量并应用于 SHOW PROCESSLIST 和 KILL 查询。

---

#### T-CRIT-12: 配置加载 JSON 错误时停止

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-12-config-fallback`
- **依赖**: 无

**涉及文件**: `apps/executor/src/lib/doppler/client.ts`

**问题**: JSON 配置解析失败时抛出错误，不尝试后备配置。

**修复**: 在 `fetchDopplerSecrets` 函数中为 `response.json()` 添加 try-catch 包装，捕获解析错误并抛出带有详细上下文的错误信息。

---

#### T-CRIT-13: INSERT 不在禁止正则中

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-13-insert-regex`
- **依赖**: 无

**涉及文件**: `packages/shared/src/validators/forbidden-detector.ts`

**问题**: INSERT 在 AST 解析时被拦截，但正则快速检查中没有。

**完成说明**: 经检查，INSERT 已经存在于 `FORBIDDEN_PATTERNS` 数组（第 19-22 行）和 `quickForbiddenCheck` 正则表达式（第 196 行）中。此问题已在之前的开发中修复。

---

#### T-CRIT-14: 请求体消费问题

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-14-body-consumption`
- **依赖**: 无

**涉及文件**: `apps/executor/src/middleware/signing.ts:211`

**问题**: 签名中间件读取请求体后，后续验证器可能无法再次读取。

**完成说明**: 经验证，Hono v4.x 已内置请求体缓冲机制，框架会自动缓存请求体以支持多次读取。此问题在当前 Hono 版本中不存在。

---

#### T-CRIT-15: 连接池统计使用内部 API

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-15-pool-stats`
- **依赖**: 无

**涉及文件**: `apps/executor/src/db/pool.ts:176`

**问题**: 使用 mysql2 未公开的内部 API 获取连接池统计。

**完成说明**: 代码已包含 `hasInternalPoolApi()` 类型守卫检查和完整的 try-catch 降级处理。当内部 API 不可用时，返回 -1（未知状态）或 0（降级模式）。

---

#### T-CRIT-16: 语句类型强制转换无验证

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-16-stmt-type-validation`
- **依赖**: 无

**涉及文件**: `apps/console/src/app/(dashboard)/requests/new/actions.ts:174`

**问题**: 语句类型直接强制转换为枚举类型，无运行时验证。

**修复**: 导入 `statementTypeSchema` 并使用 `safeParse()` 进行运行时验证，确保类型安全。

---

#### T-CRIT-17: CSRF 保护缺失

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-17-csrf-protection`
- **依赖**: 无

**涉及文件**: `apps/console/src/app/api/sessions/kill/route.ts`

**问题**: 会话终止 API 没有 CSRF 保护。

**修复**: 导入并调用 `verifyCsrf()` 函数验证请求来源，在请求处理开始时进行 Origin/Referer 检查。

---

#### T-CRIT-18: MAX_AFFECTED_ROWS 未强制执行

- **状态**: `[x]` 已完成
- **优先级**: P2
- **分支**: `happyboy2022/crit-18-max-affected-rows`
- **依赖**: 无

**涉及文件**: `apps/executor/src/services/executor.ts`

**问题**: 定义了 `MAX_AFFECTED_ROWS = 1000` 但未在执行时强制。

**修复**: 在 `executeStatement` 函数中，对写操作（UPDATE/DELETE）使用事务：先执行 SQL，检查 affectedRows 是否超过 MAX_AFFECTED_ROWS，超过则回滚，否则提交。

---

### P3 低优先级问题（技术债务）

#### T-CRIT-19: 根目录 .env.example 过时

- **状态**: `[x]` 已完成
- **优先级**: P3
- **分支**: `happyboy2022/crit-19-env-example`
- **依赖**: 无

**涉及文件**: `/.env.example`

**问题**: 环境变量示例可能与实际架构不符。

**修复**: 已更新为当前 Neon + Better Auth + Doppler 配置。

---

#### T-CRIT-20: 错误消息暴露内部细节不一致

- **状态**: `[ ]` 未开始
- **优先级**: P3
- **分支**: `happyboy2022/crit-20-error-messages`
- **依赖**: 无

**涉及文件**: executor 多处

**问题**: 不同端点的错误消息暴露细节程度不一致。

**修复**: 统一错误消息格式，生产环境隐藏内部细节。

---

#### T-CRIT-21: N+1 查询问题

- **状态**: `[ ]` 未开始
- **优先级**: P3
- **分支**: `happyboy2022/crit-21-n-plus-1`
- **依赖**: T-CRIT-02

**涉及文件**: `apps/console/src/lib/queries/request-detail.ts`

**问题**: 查询执行者信息时存在 N+1 问题。

**修复**: 使用 JOIN 或批量查询优化。

---

#### T-CRIT-22: 类型不匹配 StatementStatus vs ExecutionStatus

- **状态**: `[ ]` 未开始
- **优先级**: P3
- **分支**: `happyboy2022/crit-22-type-mismatch`
- **依赖**: 无

**涉及文件**: `packages/shared/src/types/statement.ts`

**问题**: StatementStatus 和 ExecutionStatus 状态不完全对应。

**修复**: 统一状态枚举或明确映射关系。

---

#### T-CRIT-23: 过期审批无自动清理

- **状态**: `[ ]` 未开始
- **优先级**: P3
- **分支**: `happyboy2022/crit-23-approval-cleanup`
- **依赖**: 无

**涉及文件**: 新增实现

**问题**: 过期审批状态转换已定义，但无自动清理实现。

**修复**: 添加定时任务或在查询时检查过期。

---

#### T-CRIT-24: 执行确认无请求 ID 验证

- **状态**: `[ ]` 未开始
- **优先级**: P3
- **分支**: `happyboy2022/crit-24-request-validation`
- **依赖**: 无

**涉及文件**: `packages/shared/src/schemas/execute.ts`

**问题**: 执行确认只验证 statementId，不验证其是否属于指定的 requestId。

**修复**: 添加关联验证逻辑。

---

#### T-CRIT-25: 外键约束缺失（executedBy）

- **状态**: `[ ]` 未开始
- **优先级**: P3
- **分支**: `happyboy2022/crit-25-executed-by-fk`
- **依赖**: 无

**涉及文件**: `apps/console/src/db/schema/sql-statements.ts`

**问题**: `executedBy` 字段无 onDelete 处理。

**修复**: 添加 `onDelete: 'set null'` 或 `onDelete: 'restrict'`。

---

## P0 优先级任务（核心/紧急）

### T-UI-01: 动态 Header 与用户信息展示

- **状态**: `[x]` 已完成
- **优先级**: P0
- **分支**: `happyboy2022/ui-01-dynamic-header`
- **依赖**: 无

**描述**:
将硬编码的"仪表盘"标题替换为根据当前页面动态显示的标题，从认证上下文获取真实用户信息（姓名、邮箱），显示用户头像（首字母或图片），添加用户下拉菜单。

**问题分析**:
- 当前 Header 标题固定显示"仪表盘"，不随页面变化
- 用户信息只显示硬编码的 "AD" 头像

**涉及文件**:
- `apps/console/src/components/layout/header.tsx`
- `apps/console/src/app/(dashboard)/layout.tsx`

**验收标准**:
- [x] Header 标题随页面路由变化（请求管理、审批管理、用户管理等）
- [x] 用户头像显示真实首字母
- [x] 下拉菜单显示用户名和邮箱
- [x] 登出功能正常工作

---

### T-UI-02: 审批队列倒计时显示

- **状态**: `[x]` 已完成
- **优先级**: P0
- **分支**: `happyboy2022/ui-02-approval-countdown`
- **依赖**: 无

**描述**:
在审批队列中显示每个请求的剩余审批时间（24小时过期），添加紧急程度颜色指示，实时倒计时更新。

**问题分析**:
- 审批队列列表中没有显示剩余时间
- 倒计时使用60秒间隔，可能显示过时信息

**涉及文件**:
- `apps/console/src/components/admin/approval-queue.tsx`
- 新建: `apps/console/src/components/shared/countdown-timer.tsx`

**验收标准**:
- [x] 每个审批卡片显示剩余时间（如 "剩余 12小时 30分钟"）
- [x] 根据剩余时间显示不同颜色（绿色 >12h、黄色 6-12h、红色 <6h）
- [x] 倒计时每秒实时更新无需刷新页面

---

### T-SYNC-01: SWR/React Query 集成

- **状态**: `[x]` 已完成
- **优先级**: P0
- **分支**: `happyboy2022/sync-01-data-fetching`
- **依赖**: 无

**描述**:
集成 SWR 或 React Query 进行数据获取，实现自动后台刷新，配置 stale-while-revalidate 策略。

**问题分析**:
- 当前没有自动刷新机制，依赖手动导航刷新
- 没有 WebSocket/轮询实现实时更新

**涉及文件**:
- 新建: `apps/console/src/lib/hooks/use-requests.ts`
- 新建: `apps/console/src/lib/hooks/use-approvals.ts`
- 新建: `apps/console/src/lib/hooks/index.ts`
- 新建: `apps/console/src/app/providers.tsx`
- 新建: `apps/console/src/app/api/approvals/route.ts`
- 新建: `apps/console/src/app/api/requests/route.ts`
- 修改: `apps/console/src/app/layout.tsx`

**验收标准**:
- [x] 窗口聚焦时自动刷新数据
- [x] 后台轮询（可配置间隔）
- [x] 刷新时显示旧数据（stale-while-revalidate）
- [x] 正确处理加载状态和错误状态

---

### T-SYNC-02: 审批队列自动刷新

- **状态**: `[x]` 已完成
- **优先级**: P0
- **分支**: `happyboy2022/sync-02-approval-refresh`
- **依赖**: T-SYNC-01

**描述**:
实现审批队列的轮询更新，新请求到达时显示通知，实时更新倒计时。

**涉及文件**:
- 修改: `apps/console/src/app/(dashboard)/admin/approvals/page.tsx`
- 新建: `apps/console/src/components/admin/approvals-container.tsx`

**验收标准**:
- [x] 新审批在 10 秒内出现（配置为每 10 秒刷新）
- [x] 显示最后更新时间和刷新状态
- [x] 无需页面刷新，支持手动刷新按钮

---

### T-SYNC-03: 执行进度实时更新

- **状态**: `[ ]` 未开始
- **优先级**: P0
- **分支**: `happyboy2022/sync-03-execution-progress`
- **依赖**: 无

**描述**:
实现执行状态的实时更新，多语句执行时显示实时进度，显示执行耗时。

**涉及文件**:
- `apps/console/src/components/requests/execute-dialog.tsx`
- 新建: `apps/console/src/lib/hooks/use-execution-status.ts`

**验收标准**:
- [ ] 执行期间每 2 秒更新状态
- [ ] 进度条反映已完成语句数
- [ ] 实时显示耗时

---

### T-SEC-01: 速率限制中间件

- **状态**: `[ ]` 未开始
- **优先级**: P0
- **分支**: `happyboy2022/sec-01-rate-limiting`
- **依赖**: 无

**描述**:
实现基于 API Token 的速率限制，为不同端点配置不同限制，在响应中添加速率限制 Header。

**问题分析**:
- 当前 Executor 没有速率限制保护
- 可能被恶意请求攻击

**涉及文件**:
- 新建: `apps/executor/src/middleware/rate-limit.ts`
- `apps/executor/src/index.ts`

**验收标准**:
- [ ] 各端点速率限制生效（如 execute: 10/min, sessions: 30/min）
- [ ] 超限返回 429 状态码
- [ ] 响应包含 X-RateLimit-Limit、X-RateLimit-Remaining、X-RateLimit-Reset Header
- [ ] 限制可通过环境变量配置

---

### T-SEC-02: 请求/响应日志中间件

- **状态**: `[ ]` 未开始
- **优先级**: P0
- **分支**: `happyboy2022/sec-02-request-logging`
- **依赖**: 无

**描述**:
记录所有 API 请求（时间戳、端点、耗时），记录请求体（脱敏敏感信息），记录响应状态和错误，结构化 JSON 日志。

**涉及文件**:
- 新建: `apps/executor/src/middleware/request-logger.ts`
- `apps/executor/src/index.ts`

**验收标准**:
- [ ] 所有请求记录关键信息（时间戳、方法、路径、状态码）
- [ ] 敏感数据在日志中脱敏（密码、Token 等）
- [ ] 记录每个请求的耗时
- [ ] 错误包含堆栈信息

---

## P1 优先级任务（重要）

### T-UI-03: 请求列表全文搜索

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/ui-03-fulltext-search`
- **依赖**: 无

**描述**:
在筛选器中添加搜索输入框，实现标题、描述、SQL 内容的服务端全文搜索，添加防抖搜索。

**问题分析**:
- 当前请求列表没有全文搜索功能
- 用户难以快速找到特定请求

**涉及文件**:
- `apps/console/src/components/requests/request-filters.tsx`
- `apps/console/src/lib/queries/requests.ts`
- `apps/console/src/app/(dashboard)/requests/page.tsx`

**验收标准**:
- [ ] 搜索框出现在筛选区域
- [ ] 搜索覆盖标题、描述、SQL 内容
- [ ] 300ms 防抖延迟
- [ ] 有清除搜索按钮

---

### T-UI-04: 批量用户操作

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/ui-04-batch-user-ops`
- **依赖**: 无

**描述**:
用户列表添加复选框选择，实现批量激活/暂停/角色变更操作，添加批量操作确认对话框。

**涉及文件**:
- `apps/console/src/components/admin/user-list.tsx`
- `apps/console/src/app/(dashboard)/admin/users/actions.ts`
- 新建: `apps/console/src/components/admin/batch-user-dialog.tsx`

**验收标准**:
- [ ] 可通过复选框选择多个用户
- [ ] 选中用户后显示批量操作下拉菜单
- [ ] 确认对话框显示受影响用户数量
- [ ] 操作完成后有反馈 Toast

---

### T-UI-05: 审计日志导出

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/ui-05-audit-export`
- **依赖**: 无

**描述**:
在审计日志页面添加导出按钮，支持 JSON 和 CSV 格式导出，导出应用当前筛选条件。

**涉及文件**:
- `apps/console/src/components/admin/audit-log-list.tsx`
- 新建: `apps/console/src/app/(dashboard)/admin/audit/export/route.ts`
- 新建: `apps/console/src/components/admin/audit-export-button.tsx`

**验收标准**:
- [ ] 审计日志页面可见导出按钮
- [ ] 导出遵循当前筛选设置
- [ ] JSON 和 CSV 格式均正常工作
- [ ] 下载文件名包含时间戳

---

### T-UI-06: SQL 编辑器增强

- **状态**: `[x]` 已完成
- **优先级**: P1
- **分支**: `happyboy2022/sql-editor-enhance`
- **依赖**: 无

**描述**:
使用 CodeMirror linter 添加内联语法错误指示，在侧边栏显示错误标记，悬停时显示错误详情 Tooltip。

**问题分析**:
- 当前 SQL 编辑器缺少语法错误指示器
- 用户需要提交后才能发现错误

**涉及文件**:
- `apps/console/src/components/requests/sql-editor.tsx`
- `apps/console/src/lib/sql-linter.ts` (新建)

**验收标准**:
- [x] SQL 语法错误在编辑器中高亮（红色波浪线）
- [x] 侧边栏显示错误标记（红色圆点）
- [x] 悬停错误显示详细信息
- [x] 编辑器在各浏览器正确初始化

---

### T-SYNC-04: 会话列表实时刷新

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/sync-04-session-refresh`
- **依赖**: T-SYNC-01

**描述**:
增强现有自动刷新切换功能，添加活跃刷新的视觉指示，显示正在运行查询的实时持续时间。

**涉及文件**:
- `apps/console/src/components/admin/session-manager.tsx`
- `apps/console/src/components/admin/session-list.tsx`

**验收标准**:
- [ ] 启用时每 5 秒更新活跃会话
- [ ] 查询持续时间实时更新
- [ ] 运行中查询有脉冲/视觉指示

---

### T-SYNC-05: 请求状态变更通知

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/sync-05-status-notifications`
- **依赖**: T-SYNC-01

**描述**:
添加状态变更的 Toast 通知，请求被批准/拒绝时通知，执行完成时通知。

**涉及文件**:
- 新建: `apps/console/src/components/shared/notification-provider.tsx`
- 新建: `apps/console/src/components/shared/toast.tsx`
- `apps/console/src/components/requests/request-list.tsx`

**验收标准**:
- [ ] 相关状态变更时显示 Toast
- [ ] 通知可关闭
- [ ] 通知中包含相关请求链接

---

### T-FEAT-01: 统一导入/导出 UI

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/feat-01-import-export-ui`
- **依赖**: 无

**描述**:
创建统一的导入/导出操作模态框，导入和导出样式一致，添加拖放文件上传。

**问题分析**:
- 当前导出按钮和导入页面是分开的，UI 不一致
- 导入需要跳转到单独页面

**涉及文件**:
- `apps/console/src/components/requests/export-button.tsx`
- `apps/console/src/components/requests/import-form.tsx`
- 新建: `apps/console/src/components/requests/import-export-modal.tsx`

**验收标准**:
- [ ] 单个按钮打开统一模态框
- [ ] 模态框内有导入/导出标签页
- [ ] 拖放文件上传正常工作
- [ ] 两种操作都有进度指示

---

### T-FEAT-03: 会话运行查询显示

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/feat-03-session-queries`
- **依赖**: 无

**描述**:
增强会话列表显示正在运行的 SQL，添加 SQL 语法高亮，显示查询开始时间和持续时间。

**问题分析**:
- 当前会话管理没有显示正在运行的查询内容
- 管理员无法判断是否需要终止某个会话

**涉及文件**:
- `apps/console/src/components/admin/session-list.tsx`
- `apps/console/src/lib/executor/sessions.ts`

**验收标准**:
- [ ] 每个会话可见正在运行的 SQL
- [ ] SQL 有语法高亮
- [ ] 持续时间实时更新

---

### T-SEC-03: 增强 SQL 验证

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/sec-03-sql-validation`
- **依赖**: 无

**描述**:
添加 COMMIT 模式绕过检测，增强 WHERE 子句边界情况验证，添加 SQL 注入模式测试。

**问题分析**:
- COMMIT 模式检测可能有漏洞（如 `COMMIT /* comment */`）
- WHERE 子句检测可能遗漏边界情况（如 `WHERE (1=1)`）

**涉及文件**:
- `packages/shared/src/validators/where-validator.ts`
- `packages/shared/src/validators/forbidden-detector.ts`
- 新建: `packages/shared/src/validators/__tests__/edge-cases.test.ts`

**验收标准**:
- [ ] COMMIT/ROLLBACK 各种变体检测正常工作
- [ ] 复杂 WHERE 模式验证通过（括号、嵌套等）
- [ ] 全面的测试覆盖（>90%）
- [ ] 有效 SQL 无误报

---

### T-SEC-04: 进程追踪器内存优化

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/sec-04-process-tracker`
- **依赖**: 无

**描述**:
添加最大条目限制防止内存增长，实现旧条目的 LRU 淘汰，添加使用情况监控指标。

**问题分析**:
- 当前进程追踪器使用 TTL 清理，但没有最大条目限制
- 高并发场景可能导致内存持续增长

**涉及文件**:
- `apps/executor/src/services/process-tracker.ts`

**验收标准**:
- [ ] 最大追踪 10,000 个进程
- [ ] 达到限制时进行 LRU 淘汰
- [ ] 监控指标可用（通过 /health/pools 端点）

---

### T-SEC-05: Executor 集成测试

- **状态**: `[ ]` 未开始
- **优先级**: P1
- **分支**: `happyboy2022/sec-05-integration-tests`
- **依赖**: 无

**描述**:
添加使用测试数据库的集成测试，端到端测试执行端点，测试会话管理，测试错误处理场景。

**涉及文件**:
- 新建: `apps/executor/src/__tests__/integration/execute.test.ts`
- 新建: `apps/executor/src/__tests__/integration/sessions.test.ts`
- 新建: `apps/executor/src/__tests__/integration/setup.ts`

**验收标准**:
- [ ] 集成测试在 CI 中运行
- [ ] 代码覆盖率 >80%
- [ ] 测试覆盖正常路径和错误场景

---

## P2 优先级任务（锦上添花）

### T-UI-07: 模板预览功能

- **状态**: `[ ]` 未开始
- **优先级**: P2
- **分支**: `happyboy2022/ui-07-template-preview`
- **依赖**: T-UI-01

**描述**:
选择模板时添加预览面板，显示带语法高亮的模板 SQL 内容，显示模板元数据。

**涉及文件**:
- `apps/console/src/components/requests/template-selector.tsx`
- 新建: `apps/console/src/components/requests/template-preview.tsx`

**验收标准**:
- [ ] 悬停/点击模板时显示预览
- [ ] SQL 内容有语法高亮
- [ ] 元数据清晰显示（作者、更新时间、标签）

---

### T-UI-08: 移动端响应式布局

- **状态**: `[ ]` 未开始
- **优先级**: P2
- **分支**: `happyboy2022/ui-08-mobile-responsive`
- **依赖**: T-UI-03

**描述**:
添加可折叠侧边栏，实现汉堡菜单，调整表格布局适应小屏幕，改善移动端触摸目标。

**问题分析**:
- 当前侧边栏固定宽度 264px，移动端过宽
- 表格没有移动端优化

**涉及文件**:
- `apps/console/src/components/layout/sidebar.tsx`
- `apps/console/src/components/layout/header.tsx`
- `apps/console/src/app/(dashboard)/layout.tsx`

**验收标准**:
- [ ] 移动端侧边栏可折叠
- [ ] 汉堡菜单可打开/关闭侧边栏
- [ ] 表格在移动端可横向滚动
- [ ] 所有交互元素易于点击（最小 44x44px）

---

### T-FEAT-02: 模板版本历史

- **状态**: `[ ]` 未开始
- **优先级**: P2
- **分支**: `happyboy2022/feat-02-template-versions`
- **依赖**: T-FEAT-01

**描述**:
在新版本表中追踪模板变更，在模板对话框中添加版本历史面板，允许查看和恢复之前版本。

**涉及文件**:
- 新建: `apps/console/src/db/schema/sql-template-versions.ts`
- `apps/console/src/components/admin/template-dialog.tsx`
- 新建: `apps/console/src/components/admin/template-history.tsx`
- `apps/console/src/app/(dashboard)/admin/templates/actions.ts`

**验收标准**:
- [ ] 模板编辑创建新版本条目
- [ ] 版本历史在 UI 中可查看
- [ ] 可恢复之前的模板版本
- [ ] 版本之间有差异视图

---

### T-FEAT-04: 请求版本差异视图增强

- **状态**: `[ ]` 未开始
- **优先级**: P2
- **分支**: `happyboy2022/feat-04-version-diff`
- **依赖**: T-FEAT-03

**描述**:
增强差异视图为并排比较，添加添加/删除的颜色编码，改善大差异的可用性。

**涉及文件**:
- `apps/console/src/components/requests/version-history.tsx`
- `apps/console/src/components/requests/version-diff.tsx`

**验收标准**:
- [ ] 并排差异视图可用
- [ ] 变更有清晰的颜色编码（绿色添加、红色删除）
- [ ] 未变更部分可折叠

---

## 并行开发建议

以下任务流可以同时在不同 WorkTree 分支上进行：

| 开发流 | 任务顺序 | 负责方向 |
|-------|----------|---------|
| 流 A | T-UI-01 → T-UI-02 → T-UI-07 | UI 界面核心 |
| 流 B | T-UI-03 → T-UI-04 → T-UI-08 | UI 搜索与批量 |
| 流 C | T-UI-05 → T-UI-06 | UI 工具增强 |
| 流 D | T-SYNC-01 → T-SYNC-02 → T-SYNC-04 | 数据同步基础 |
| 流 E | T-SYNC-03 → T-SYNC-05 | 执行与通知 |
| 流 F | T-FEAT-01 → T-FEAT-02 | 功能增强 |
| 流 G | T-FEAT-03 → T-FEAT-04 | 会话与差异 |
| 流 H | T-SEC-01 → T-SEC-02 → T-SEC-05 | 安全基础 |
| 流 I | T-SEC-03 → T-SEC-04 | 安全验证 |

---

## 进度追踪

### 🚨 CRIT 关键问题修复（25 项）

**P0 致命问题（4 项）**
- [ ] T-CRIT-01: 空签名密钥安全漏洞
- [ ] T-CRIT-02: SQL 查询数据丢失 BUG
- [ ] T-CRIT-03: Executor 客户端无响应状态检查
- [ ] T-CRIT-04: 进程终止功能未实现

**P1 严重问题（6 项）**
- [ ] T-CRIT-05: Nonce 缓存非 Redis 备份
- [ ] T-CRIT-06: Redis 可用性永久缓存
- [ ] T-CRIT-07: URL 解析无验证
- [ ] T-CRIT-08: 审计日志外键约束缺失
- [ ] T-CRIT-09: 语句状态转换未定义
- [ ] T-CRIT-10: COMMIT 正则绕过漏洞

**P2 中等问题（8 项）**
- [ ] T-CRIT-11: 健康检查无超时
- [ ] T-CRIT-12: 配置加载 JSON 错误时停止
- [ ] T-CRIT-13: INSERT 不在禁止正则中
- [ ] T-CRIT-14: 请求体消费问题
- [ ] T-CRIT-15: 连接池统计使用内部 API
- [ ] T-CRIT-16: 语句类型强制转换无验证
- [ ] T-CRIT-17: CSRF 保护缺失
- [ ] T-CRIT-18: MAX_AFFECTED_ROWS 未强制执行

**P3 技术债务（7 项）**
- [x] T-CRIT-19: 根目录 .env.example 过时
- [ ] T-CRIT-20: 错误消息暴露内部细节不一致
- [ ] T-CRIT-21: N+1 查询问题
- [ ] T-CRIT-22: 类型不匹配 StatementStatus vs ExecutionStatus
- [ ] T-CRIT-23: 过期审批无自动清理
- [ ] T-CRIT-24: 执行确认无请求 ID 验证
- [ ] T-CRIT-25: 外键约束缺失（executedBy）

---

### P0 任务（7 项）
- [x] T-UI-01: 动态 Header 与用户信息展示
- [x] T-UI-02: 审批队列倒计时显示
- [x] T-SYNC-01: SWR/React Query 集成
- [x] T-SYNC-02: 审批队列自动刷新
- [ ] T-SYNC-03: 执行进度实时更新
- [ ] T-SEC-01: 速率限制中间件
- [ ] T-SEC-02: 请求/响应日志中间件

### P1 任务（11 项）
- [ ] T-UI-03: 请求列表全文搜索
- [ ] T-UI-04: 批量用户操作
- [ ] T-UI-05: 审计日志导出
- [x] T-UI-06: SQL 编辑器增强
- [ ] T-SYNC-04: 会话列表实时刷新
- [ ] T-SYNC-05: 请求状态变更通知
- [ ] T-FEAT-01: 统一导入/导出 UI
- [ ] T-FEAT-03: 会话运行查询显示
- [ ] T-SEC-03: 增强 SQL 验证
- [ ] T-SEC-04: 进程追踪器内存优化
- [ ] T-SEC-05: Executor 集成测试

### P2 任务（4 项）
- [ ] T-UI-07: 模板预览功能
- [ ] T-UI-08: 移动端响应式布局
- [ ] T-FEAT-02: 模板版本历史
- [ ] T-FEAT-04: 请求版本差异视图增强

### 已完成
- T-UI-01: 动态 Header 与用户信息展示 (2025-12-20)
- T-UI-02: 审批队列倒计时显示 (2025-12-20)
- T-SYNC-01: SWR/React Query 集成 (2025-12-21)
- T-SYNC-02: 审批队列自动刷新 (2025-12-21)
- T-UI-06: SQL 编辑器增强 (2025-12-22)

---

## 关键文件参考

| 文件路径 | 说明 |
|---------|------|
| `apps/console/src/components/layout/header.tsx` | Header 组件，需要动态化 |
| `apps/console/src/components/admin/approval-queue.tsx` | 审批队列，需要添加倒计时和刷新 |
| `apps/console/src/app/(dashboard)/layout.tsx` | Dashboard 布局，添加 Provider |
| `apps/executor/src/index.ts` | Executor 入口，添加中间件 |
| `packages/shared/src/validators/` | SQL 验证器，需要增强边界情况 |

---

> 最后更新时间：2025-12-25
