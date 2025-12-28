# 术语定义

## 业务术语

| 术语 | 英文 | 说明 |
|------|------|------|
| 服务/服 | Service | 目标执行环境，如"美国一服"、"新加坡一服" |
| 数据库类型 | DB Type | 数据库引擎类型：polardb_mysql、adb、redis |
| 数据库角色 | DB Role | PolarDB: primary（主库）/ record（从库）；Redis: db index |
| SQL 请求 | SQL Request | 一次请求单，包含多条 SQL Statement |
| SQL 语句 | SQL Statement | 拆分后的单条 SQL |
| 请求版本 | Request Version | 请求的修订版本，每次修改创建新版本 |
| 会话/进程 | Session/Process | MySQL processlist 中的 connection id |
| 预检 | Precheck | 执行写操作前的 SELECT COUNT 查询，用于确认影响行数 |

## 角色术语

| 角色 | 说明 |
|------|------|
| PENDING | 注册未激活，无法进入后台 |
| USER | 普通用户，可创建请求、查看自己的请求与结果 |
| ADMIN | 管理员，可审批、执行、管理用户、查看审计日志 |

## 状态术语

### 用户状态 (User Status)

| 状态 | 说明 |
|------|------|
| ACTIVE | 正常状态，可以登录和操作 |
| SUSPENDED | 已暂停，无法登录 |

### 请求状态 (Request Status)

| 状态 | 说明 |
|------|------|
| PENDING_APPROVAL | 待审批 |
| CHANGES_REQUESTED | 需要修改 |
| REJECTED | 已驳回 |
| APPROVED | 已审批（待执行） |
| APPROVAL_EXPIRED | 审批已过期（超过 24 小时） |
| EXECUTING | 执行中 |
| SUCCEEDED | 执行成功 |
| FAILED | 执行失败 |
| TERMINATED | 已终止（被 kill） |

### 语句状态 (Statement Status)

| 状态 | 说明 |
|------|------|
| PENDING | 待执行 |
| EXECUTING | 执行中 |
| SUCCEEDED | 执行成功 |
| FAILED | 执行失败 |
| SKIPPED | 已跳过（前序语句失败） |

### 审批决策 (Approval Decision)

| 决策 | 说明 |
|------|------|
| APPROVE | 批准，设置 24 小时有效期 |
| REJECT | 驳回，需要填写原因 |
| CHANGES_REQUESTED | 要求修改，需要填写修改意见 |

## 技术术语

| 术语 | 说明 |
|------|------|
| Console | 管理后台 Web 应用（Next.js） |
| Executor | SQL 执行服务（Hono） |
| FC | Function Compute，阿里云函数计算 |
| VPC | Virtual Private Cloud，虚拟私有云 |

## 常量定义

| 常量 | 值 | 说明 |
|------|-----|------|
| MAX_AFFECTED_ROWS | 1000 | 影响行数阈值，超过需要额外确认 |
| APPROVAL_EXPIRY_HOURS | 24 | 审批有效期（小时） |
| MAX_RESULT_ROWS | 200 | SELECT 结果集最大返回行数 |
| DEFAULT_TIMEOUT_MS | 30000 | 默认执行超时（毫秒） |
| MAX_TIMEOUT_MS | 120000 | 最大执行超时（毫秒） |
