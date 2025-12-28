# 阶段四：Console 核心功能

## 概述

本阶段实现 Console 的核心功能：SQL 请求的创建、列表、详情和审批管理。

## 任务列表

### T-010: 请求创建页面

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-005, T-008, T-009**
- **可并行：否**

#### 任务描述

实现 SQL 请求创建页面，包括目标选择、SQL 编辑和实时校验。

参考文档：[请求工作流](../specs/request-workflow.md)

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/requests/new/page.tsx`）

2. 创建目标选择器组件（`src/components/requests/target-selector.tsx`）：
   - Service 下拉选择
   - DB Type 下拉选择
   - DB Role 下拉选择
   - 联动逻辑（选择 Service 后加载对应的 DB Targets）

3. 创建 SQL 编辑器组件（`src/components/requests/sql-editor.tsx`）：
   - 多行文本输入
   - 语法高亮（可选，使用 Monaco Editor 或 CodeMirror）
   - 行号显示

4. 创建校验反馈组件（`src/components/requests/validation-feedback.tsx`）：
   - 显示校验结果
   - 错误列表（红色）
   - 警告列表（黄色）
   - 语句类型标记

5. 创建预检配置组件（`src/components/requests/precheck-config.tsx`）：
   - 显示需要预检的语句
   - 预检 SQL 输入框（预填建议值）
   - 期望行数输入

6. 创建模板选择器（`src/components/requests/template-selector.tsx`）：
   - 模板列表
   - 选择模板后填充 SQL

7. 创建请求表单组件（`src/components/requests/request-form.tsx`）：
   - 整合上述组件
   - 标题输入
   - 描述输入
   - 提交按钮

8. 创建提交 Server Action（`src/app/(dashboard)/requests/new/actions.ts`）：
   ```typescript
   'use server';

   export async function createRequest(formData: FormData) {
     // 1. 验证用户权限
     // 2. 获取表单数据
     // 3. 校验 SQL
     // 4. 创建 request 记录
     // 5. 创建 version 记录
     // 6. 创建 statements 记录
     // 7. 写入 audit_log
     // 8. 重定向到请求详情页
   }
   ```

9. 实时校验逻辑：
   - 使用 `useDebouncedCallback` 防抖
   - SQL 变化时调用校验器
   - 更新校验反馈

#### 产出文件

- `apps/console/src/app/(dashboard)/requests/new/page.tsx`
- `apps/console/src/app/(dashboard)/requests/new/actions.ts`
- `apps/console/src/components/requests/request-form.tsx`
- `apps/console/src/components/requests/target-selector.tsx`
- `apps/console/src/components/requests/sql-editor.tsx`
- `apps/console/src/components/requests/validation-feedback.tsx`
- `apps/console/src/components/requests/precheck-config.tsx`
- `apps/console/src/components/requests/template-selector.tsx`

#### 验收标准

- [x] 可以选择目标（Service + DB Type + DB Role）
- [x] 可以输入 SQL
- [x] 实时显示校验结果
- [x] 校验失败时禁止提交
- [x] 写操作显示预检配置
- [x] 提交成功后跳转到详情页

---

### T-011: 请求列表页面

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-005, T-008**
- **可并行：是**（可与 T-010 并行）

#### 任务描述

实现 SQL 请求列表页面，支持筛选和分页。

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/requests/page.tsx`）：
   ```typescript
   export default async function RequestsPage({
     searchParams,
   }: {
     searchParams: { status?: string; page?: string };
   }) {
     const user = await requireAuth();
     const requests = await getRequests(user.id, searchParams);
     return <RequestList requests={requests} />;
   }
   ```

2. 创建筛选组件（`src/components/requests/request-filters.tsx`）：
   - 状态筛选（多选）
   - 目标筛选（Service）
   - 日期范围筛选
   - 是否包含写操作筛选

3. 创建列表组件（`src/components/requests/request-list.tsx`）：
   - 使用 shadcn/ui Table 组件
   - 列：标题、状态、目标、类型、创建时间、版本
   - 状态使用颜色标记
   - 包含写操作显示图标

4. 创建状态徽章组件（`src/components/requests/status-badge.tsx`）：
   ```typescript
   const STATUS_COLORS = {
     PENDING_APPROVAL: 'yellow',
     APPROVED: 'green',
     REJECTED: 'red',
     EXECUTING: 'blue',
     SUCCEEDED: 'green',
     FAILED: 'red',
     // ...
   };
   ```

5. 创建分页组件（`src/components/shared/pagination.tsx`）

6. 数据获取函数（`src/lib/queries/requests.ts`）：
   ```typescript
   export async function getRequests(
     userId: string,
     filters: RequestFilters
   ) {
     // 使用 Drizzle 查询
     // 应用筛选条件
     // 分页
   }
   ```

#### 产出文件

- `apps/console/src/app/(dashboard)/requests/page.tsx`
- `apps/console/src/components/requests/request-list.tsx`
- `apps/console/src/components/requests/request-filters.tsx`
- `apps/console/src/components/requests/status-badge.tsx`
- `apps/console/src/components/shared/pagination.tsx`
- `apps/console/src/lib/queries/requests.ts`

#### 验收标准

- [x] 显示当前用户的请求列表
- [x] 可以按状态筛选
- [x] 可以按目标筛选
- [x] 支持分页
- [x] 点击行可以跳转到详情

---

### T-012: 请求详情页面

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-010, T-011**
- **可并行：否**

#### 任务描述

实现 SQL 请求详情页面，显示版本历史、语句列表、审批记录和执行结果。

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/requests/[id]/page.tsx`）：
   ```typescript
   export default async function RequestDetailPage({
     params,
   }: {
     params: { id: string };
   }) {
     const user = await requireAuth();
     const request = await getRequestDetail(params.id, user.id);
     if (!request) notFound();
     return <RequestDetail request={request} />;
   }
   ```

2. 创建详情组件（`src/components/requests/request-detail.tsx`）：
   - 基本信息卡片
   - 状态显示
   - 过期时间倒计时（如果已审批）

3. 创建版本历史组件（`src/components/requests/version-history.tsx`）：
   - 版本列表
   - 版本号、创建时间、创建人
   - 当前版本标记
   - 已审批版本标记

4. 创建语句列表组件（`src/components/requests/statement-list.tsx`）：
   - 顺序号
   - SQL 文本（可折叠）
   - 类型标记
   - 校验结果
   - 预检 SQL（如有）
   - 执行状态（如已执行）
   - 执行结果（如已执行）

5. 创建审批记录组件（`src/components/requests/approval-history.tsx`）：
   - 审批人
   - 决策
   - 意见
   - 时间

6. 创建执行结果组件（`src/components/requests/execution-result.tsx`）：
   - SELECT 结果表格
   - 写操作影响行数
   - 耗时
   - 错误信息

7. 创建操作按钮区域：
   - 修改按钮（状态允许时）
   - 执行按钮（Admin + 已审批）

8. 数据获取函数（`src/lib/queries/request-detail.ts`）

#### 产出文件

- `apps/console/src/app/(dashboard)/requests/[id]/page.tsx`
- `apps/console/src/components/requests/request-detail.tsx`
- `apps/console/src/components/requests/version-history.tsx`
- `apps/console/src/components/requests/statement-list.tsx`
- `apps/console/src/components/requests/approval-history.tsx`
- `apps/console/src/components/requests/execution-result.tsx`
- `apps/console/src/lib/queries/request-detail.ts`

#### 验收标准

- [x] 显示请求基本信息
- [x] 显示版本历史
- [x] 显示语句列表及校验结果
- [x] 显示审批记录
- [x] 显示执行结果（如已执行）
- [x] 正确显示操作按钮

---

### T-013: 审批管理页面（Admin）

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-012**
- **可并行：否**

#### 任务描述

实现管理员审批管理页面，支持审批、驳回、要求修改操作。

参考文档：[请求工作流 - 审批流程](../specs/request-workflow.md#6-审批流程)

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/admin/approvals/page.tsx`）：
   ```typescript
   export default async function ApprovalsPage() {
     await requireAdmin();
     const pendingRequests = await getPendingRequests();
     return <ApprovalQueue requests={pendingRequests} />;
   }
   ```

2. 创建审批队列组件（`src/components/admin/approval-queue.tsx`）：
   - 待审批请求列表
   - 风险提示标记
   - 点击展开详情

3. 创建审批详情组件（`src/components/admin/approval-detail.tsx`）：
   - 请求信息
   - SQL 语句列表
   - 校验结果
   - 预检配置

4. 创建审批对话框（`src/components/admin/approval-dialog.tsx`）：
   - 三个操作按钮：批准、驳回、要求修改
   - 意见输入框（驳回/要求修改时必填）
   - 确认按钮

5. 创建审批 Server Actions（`src/app/(dashboard)/admin/approvals/actions.ts`）：
   ```typescript
   'use server';

   export async function approveRequest(requestId: string, versionId: string) {
     await requireAdmin();
     // 1. 验证请求状态
     // 2. 更新请求状态为 APPROVED
     // 3. 设置 approved_version_id
     // 4. 设置 expires_at = now + 24h
     // 5. 创建 approval 记录
     // 6. 写入 audit_log
   }

   export async function rejectRequest(
     requestId: string,
     versionId: string,
     reason: string
   ) {
     await requireAdmin();
     // 验证 reason 必填
     // 更新状态为 REJECTED
     // 创建 approval 记录
     // 写入 audit_log
   }

   export async function requestChanges(
     requestId: string,
     versionId: string,
     comment: string
   ) {
     await requireAdmin();
     // 验证 comment 必填
     // 更新状态为 CHANGES_REQUESTED
     // 创建 approval 记录
     // 写入 audit_log
   }
   ```

6. 筛选功能：
   - 状态筛选
   - 目标筛选
   - 提交人筛选
   - 是否包含写操作

#### 产出文件

- `apps/console/src/app/(dashboard)/admin/approvals/page.tsx`
- `apps/console/src/app/(dashboard)/admin/approvals/actions.ts`
- `apps/console/src/components/admin/approval-queue.tsx`
- `apps/console/src/components/admin/approval-detail.tsx`
- `apps/console/src/components/admin/approval-dialog.tsx`
- `apps/console/src/lib/queries/pending-requests.ts`

#### 验收标准

- [x] 显示待审批请求列表
- [x] 可以查看请求详情
- [x] 可以批准请求（设置 24h 过期）
- [x] 可以驳回请求（必须填写原因）
- [x] 可以要求修改（必须填写意见）
- [x] 操作后写入审计日志
