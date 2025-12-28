# 项目背景与目标

## 1. 背景

需要对多套数据库集群（多地域/多服）进行受控 SQL 执行、审批与审计，并提供 DB 会话管理（查看/kill）与慢日志监控能力。禁止直接给人员发放数据库连接权限，以减少误操作与安全风险。

## 2. 项目目标

构建两部分系统：

| 组件 | 技术栈 | 部署 | 职责 |
|------|--------|------|------|
| **Console** | Next.js + Better Auth + Neon | Vercel | 登录/注册、SQL 请求管理、审批、模板管理、审计、会话管理 UI |
| **Executor** | Hono | 阿里云 FC 3.0 | 唯一可访问内网数据库的服务，负责执行 SQL、查询会话、kill 会话 |

## 3. 核心原则（必须满足）

### 3.1 Console 绝不直连数据库
所有 DB 操作必须经由 Executor API。Console 中不存储任何数据库连接信息。

### 3.2 完整审计不可篡改
执行/审批/kill 等记录只能追加，不允许修改或删除。数据库层面通过 RLS 策略强制执行。

### 3.3 写操作严格门禁
UPDATE/DELETE 必须：
- 包含 WHERE 子句
- 提供预检语句（SELECT COUNT）
- 二次确认影响行数
- 超过 1000 行需要额外确认

### 3.4 多语句串行执行
逐条执行 SQL 语句，上一条失败则终止后续语句执行。

## 4. MVP 范围

### 4.1 包含功能
- 注册/登录/管理员激活（PENDING 拦截）
- 支持 PolarDB MySQL（primary/record）目标选择
- SQL 创建、拆分、规则校验（禁 DDL、UPDATE/DELETE 必须 WHERE、必须预检）
- 审批：允许/驳回/修改意见（绑定版本、24h 过期）
- 执行：Admin 串行逐条执行，失败终止后续
- 写操作二次确认（影响行数确认 + 超阈值额外确认）
- 审计：全链路不可变记录
- 会话管理：processlist + kill（仅 system-owned session）
- 模板：Admin CRUD + User 选择填充
- GitHub Actions：Console→Vercel，Executor→FC

### 4.2 不包含功能（后续迭代）
- 慢日志采集与展示
- 风险分析：Explain、AI 风险评估
- ADB/Redis 支持
- 事务模式
- 执行结果导出

## 5. 验收标准

1. PENDING 用户即使 Auth 成功也无法进入后台
2. DDL/危险语句无法提交，Executor 也会二次拦截
3. UPDATE/DELETE 无 WHERE 无法提交
4. 包含写操作的请求没有预检语句无法提交
5. 审批只对特定 version 生效，修改后必须重新审批
6. 多语句严格串行，失败则后续跳过并记录原因
7. 每条 statement 的执行结果、processId、耗时、错误都写审计
8. 能展示 processlist 并 kill 本系统产生的 session
9. Console 不包含任何 DB 连接信息
