# 阶段七：管理功能

## 概述

本阶段实现管理员专属功能：用户管理、审计日志、模板管理和会话管理。

## 任务列表

### T-019: 用户管理页面（Admin）

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-005, T-008**
- **可并行：是**（独立页面）

#### 任务描述

实现用户列表和管理功能，包括激活、暂停和角色变更。

参考文档：[认证与权限 - 用户管理](../specs/auth.md#6-用户管理admin)

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/admin/users/page.tsx`）：
   ```typescript
   export default async function UsersPage() {
     await requireAdmin();
     const users = await getAllUsers();
     return <UserList users={users} />;
   }
   ```

2. 创建用户列表组件（`src/components/admin/user-list.tsx`）：
   - 使用 Table 组件
   - 列：Email、显示名称、角色、状态、注册时间、激活时间
   - 角色使用颜色标记
   - 状态使用颜色标记

3. 创建用户操作组件（`src/components/admin/user-actions.tsx`）：
   - 激活按钮（PENDING → USER）
   - 暂停按钮（ACTIVE → SUSPENDED）
   - 恢复按钮（SUSPENDED → ACTIVE）
   - 角色变更下拉菜单（USER ↔ ADMIN）
   - 确认对话框

4. 创建筛选组件（`src/components/admin/user-filters.tsx`）：
   - 角色筛选
   - 状态筛选
   - 搜索（Email、显示名称）

5. 创建 Server Actions（`src/app/(dashboard)/admin/users/actions.ts`）：
   ```typescript
   'use server';

   export async function activateUser(userId: string) {
     const admin = await requireAdmin();

     await db.update(profiles)
       .set({
         role: 'USER',
         activatedAt: new Date(),
         activatedBy: admin.id,
         updatedAt: new Date(),
       })
       .where(eq(profiles.id, userId));

     await writeAuditLog({
       action: 'user.activate',
       target_type: 'user',
       target_id: userId,
       payload: { newRole: 'USER' },
     });

     revalidatePath('/admin/users');
   }

   export async function suspendUser(userId: string) {
     const admin = await requireAdmin();

     // 不能暂停自己
     if (userId === admin.id) {
       throw new Error('Cannot suspend yourself');
     }

     await db.update(profiles)
       .set({
         status: 'SUSPENDED',
         updatedAt: new Date(),
       })
       .where(eq(profiles.id, userId));

     await writeAuditLog({
       action: 'user.suspend',
       target_type: 'user',
       target_id: userId,
     });

     revalidatePath('/admin/users');
   }

   export async function restoreUser(userId: string) {
     await requireAdmin();

     await db.update(profiles)
       .set({
         status: 'ACTIVE',
         updatedAt: new Date(),
       })
       .where(eq(profiles.id, userId));

     await writeAuditLog({
       action: 'user.restore',
       target_type: 'user',
       target_id: userId,
     });

     revalidatePath('/admin/users');
   }

   export async function changeUserRole(userId: string, newRole: 'USER' | 'ADMIN') {
     const admin = await requireAdmin();

     // 不能修改自己的角色
     if (userId === admin.id) {
       throw new Error('Cannot change your own role');
     }

     await db.update(profiles)
       .set({
         role: newRole,
         updatedAt: new Date(),
       })
       .where(eq(profiles.id, userId));

     await writeAuditLog({
       action: 'user.role_change',
       target_type: 'user',
       target_id: userId,
       payload: { newRole },
     });

     revalidatePath('/admin/users');
   }
   ```

#### 产出文件

- `apps/console/src/app/(dashboard)/admin/users/page.tsx`
- `apps/console/src/app/(dashboard)/admin/users/actions.ts`
- `apps/console/src/components/admin/user-list.tsx`
- `apps/console/src/components/admin/user-actions.tsx`
- `apps/console/src/components/admin/user-filters.tsx`
- `apps/console/src/lib/queries/users.ts`

#### 验收标准

- [x] 显示所有用户列表
- [x] 可以激活 PENDING 用户
- [x] 可以暂停用户
- [x] 可以恢复被暂停的用户
- [x] 可以修改用户角色
- [x] 不能修改自己的状态和角色
- [x] 所有操作写入审计日志

---

### T-020: 审计日志页面（Admin）

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-005, T-008**
- **可并行：是**（独立页面）

#### 任务描述

实现审计日志查看页面，支持筛选和详情展示。

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/admin/audit/page.tsx`）：
   ```typescript
   export default async function AuditPage({
     searchParams,
   }: {
     searchParams: AuditFilters;
   }) {
     await requireAdmin();
     const logs = await getAuditLogs(searchParams);
     return <AuditLogList logs={logs} />;
   }
   ```

2. 创建审计日志列表组件（`src/components/admin/audit-log-list.tsx`）：
   - 使用 Table 组件
   - 列：时间、操作人、操作、目标类型、目标ID
   - 点击行展开详情

3. 创建筛选组件（`src/components/admin/audit-filters.tsx`）：
   - 操作类型筛选（多选）
   - 操作人筛选
   - 目标类型筛选
   - 时间范围筛选

4. 创建详情展示组件（`src/components/admin/audit-log-detail.tsx`）：
   ```typescript
   interface AuditLogDetailProps {
     log: AuditLog;
   }

   export function AuditLogDetail({ log }: AuditLogDetailProps) {
     return (
       <div className="space-y-4">
         <div className="grid grid-cols-2 gap-4">
           <div>
             <Label>操作时间</Label>
             <p>{formatDateTime(log.createdAt)}</p>
           </div>
           <div>
             <Label>操作人</Label>
             <p>{log.actor?.displayName ?? log.actorUserId}</p>
           </div>
           <div>
             <Label>操作类型</Label>
             <p>{log.action}</p>
           </div>
           <div>
             <Label>目标</Label>
             <p>{log.targetType} / {log.targetId}</p>
           </div>
         </div>
         <div>
           <Label>详情</Label>
           <pre className="bg-muted p-4 rounded text-sm overflow-auto">
             {JSON.stringify(log.payload, null, 2)}
           </pre>
         </div>
       </div>
     );
   }
   ```

5. 数据获取函数（`src/lib/queries/audit-logs.ts`）：
   ```typescript
   export async function getAuditLogs(filters: AuditFilters) {
     let query = db
       .select({
         id: auditLogs.id,
         actorUserId: auditLogs.actorUserId,
         action: auditLogs.action,
         targetType: auditLogs.targetType,
         targetId: auditLogs.targetId,
         payload: auditLogs.payload,
         createdAt: auditLogs.createdAt,
         actor: {
           displayName: profiles.displayName,
           email: profiles.email,
         },
       })
       .from(auditLogs)
       .leftJoin(profiles, eq(auditLogs.actorUserId, profiles.id))
       .orderBy(desc(auditLogs.createdAt));

     // 应用筛选条件
     if (filters.action) {
       query = query.where(eq(auditLogs.action, filters.action));
     }
     // ... 其他筛选

     return query.limit(100);
   }
   ```

6. 添加分页功能

#### 产出文件

- `apps/console/src/app/(dashboard)/admin/audit/page.tsx`
- `apps/console/src/components/admin/audit-log-list.tsx`
- `apps/console/src/components/admin/audit-filters.tsx`
- `apps/console/src/components/admin/audit-log-detail.tsx`
- `apps/console/src/lib/queries/audit-logs.ts`

#### 验收标准

- [x] 显示审计日志列表
- [x] 可以按操作类型筛选
- [x] 可以按操作人筛选
- [x] 可以按时间范围筛选
- [x] 可以查看详情（payload JSON）
- [x] 支持分页

---

### T-021: 模板管理页面（Admin）

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-005, T-008**
- **可并行：是**（独立页面）

#### 任务描述

实现 SQL 模板的增删改查功能。

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/admin/templates/page.tsx`）：
   ```typescript
   export default async function TemplatesPage() {
     await requireAdmin();
     const templates = await getTemplates();
     return <TemplateList templates={templates} />;
   }
   ```

2. 创建模板列表组件（`src/components/admin/template-list.tsx`）：
   - 使用 Table 组件
   - 列：名称、数据库类型、标签、状态、更新时间
   - 操作按钮：编辑、启用/禁用、删除

3. 创建模板表单组件（`src/components/admin/template-form.tsx`）：
   ```typescript
   interface TemplateFormProps {
     template?: Template; // 编辑时传入
     onSubmit: (data: TemplateFormData) => void;
     onCancel: () => void;
   }

   export function TemplateForm({ template, onSubmit, onCancel }: TemplateFormProps) {
     return (
       <form onSubmit={handleSubmit} className="space-y-4">
         <div>
           <Label>模板名称</Label>
           <Input name="name" defaultValue={template?.name} required />
         </div>
         <div>
           <Label>描述</Label>
           <Textarea name="description" defaultValue={template?.description} />
         </div>
         <div>
           <Label>数据库类型</Label>
           <Select name="dbType" defaultValue={template?.dbType}>
             <SelectItem value="polardb_mysql">PolarDB MySQL</SelectItem>
           </Select>
         </div>
         <div>
           <Label>标签</Label>
           <Input
             name="tags"
             placeholder="用逗号分隔"
             defaultValue={template?.tags?.join(', ')}
           />
         </div>
         <div>
           <Label>SQL 模板</Label>
           <Textarea
             name="sqlText"
             rows={10}
             defaultValue={template?.sqlText}
             required
           />
         </div>
         <div className="flex justify-end gap-2">
           <Button type="button" variant="outline" onClick={onCancel}>
             取消
           </Button>
           <Button type="submit">保存</Button>
         </div>
       </form>
     );
   }
   ```

4. 创建模板对话框（`src/components/admin/template-dialog.tsx`）：
   - 新建模板对话框
   - 编辑模板对话框
   - 删除确认对话框

5. 创建 Server Actions（`src/app/(dashboard)/admin/templates/actions.ts`）：
   ```typescript
   'use server';

   export async function createTemplate(formData: FormData) {
     const admin = await requireAdmin();

     const template = await db.insert(sqlTemplates)
       .values({
         name: formData.get('name') as string,
         description: formData.get('description') as string,
         dbType: formData.get('dbType') as string,
         tags: (formData.get('tags') as string).split(',').map(t => t.trim()),
         sqlText: formData.get('sqlText') as string,
         enabled: true,
         createdBy: admin.id,
       })
       .returning();

     await writeAuditLog({
       action: 'template.create',
       target_type: 'template',
       target_id: template[0].id,
       payload: { name: template[0].name },
     });

     revalidatePath('/admin/templates');
   }

   export async function updateTemplate(templateId: string, formData: FormData) {
     await requireAdmin();
     // 更新逻辑
   }

   export async function toggleTemplate(templateId: string, enabled: boolean) {
     await requireAdmin();
     // 启用/禁用逻辑
   }

   export async function deleteTemplate(templateId: string) {
     await requireAdmin();
     // 逻辑删除
   }
   ```

#### 产出文件

- `apps/console/src/app/(dashboard)/admin/templates/page.tsx`
- `apps/console/src/app/(dashboard)/admin/templates/actions.ts`
- `apps/console/src/components/admin/template-list.tsx`
- `apps/console/src/components/admin/template-form.tsx`
- `apps/console/src/components/admin/template-dialog.tsx`
- `apps/console/src/lib/queries/templates.ts`

#### 验收标准

- [x] 显示模板列表
- [x] 可以创建新模板
- [x] 可以编辑模板
- [x] 可以启用/禁用模板
- [x] 可以删除模板（逻辑删除）
- [x] 所有操作写入审计日志

---

### T-022: 会话管理页面（Admin）

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-016**
- **可并行：否**

#### 任务描述

实现数据库会话列表展示和 kill 功能。

参考文档：[执行流程 - 中断执行](../specs/execution.md#10-中断执行)

#### 详细步骤

1. 创建页面路由（`src/app/(dashboard)/admin/sessions/page.tsx`）：
   ```typescript
   export default async function SessionsPage() {
     await requireAdmin();
     return <SessionManager />;
   }
   ```

2. 创建会话管理组件（`src/components/admin/session-manager.tsx`）：
   - 目标选择器（Service + DB Role）
   - 刷新按钮
   - 自动刷新开关

3. 创建会话列表组件（`src/components/admin/session-list.tsx`）：
   ```typescript
   interface SessionListProps {
     sessions: Session[];
     onKill: (processId: number) => void;
   }

   export function SessionList({ sessions, onKill }: SessionListProps) {
     return (
       <Table>
         <TableHeader>
           <TableRow>
             <TableHead>Process ID</TableHead>
             <TableHead>User</TableHead>
             <TableHead>Host</TableHead>
             <TableHead>DB</TableHead>
             <TableHead>Command</TableHead>
             <TableHead>Time (s)</TableHead>
             <TableHead>State</TableHead>
             <TableHead>SQL</TableHead>
             <TableHead>操作</TableHead>
           </TableRow>
         </TableHeader>
         <TableBody>
           {sessions.map((session) => (
             <TableRow key={session.id}>
               <TableCell>{session.id}</TableCell>
               <TableCell>{session.user}</TableCell>
               <TableCell>{session.host}</TableCell>
               <TableCell>{session.db}</TableCell>
               <TableCell>{session.command}</TableCell>
               <TableCell>
                 <span className={session.time > 60 ? 'text-red-500' : ''}>
                   {session.time}
                 </span>
               </TableCell>
               <TableCell>{session.state}</TableCell>
               <TableCell className="max-w-xs truncate" title={session.info}>
                 {session.info}
               </TableCell>
               <TableCell>
                 {session.isSystemOwned && (
                   <Button
                     size="sm"
                     variant="destructive"
                     onClick={() => onKill(session.id)}
                   >
                     Kill
                   </Button>
                 )}
               </TableCell>
             </TableRow>
           ))}
         </TableBody>
       </Table>
     );
   }
   ```

4. 创建 Kill 对话框（`src/components/admin/kill-dialog.tsx`）：
   ```typescript
   interface KillDialogProps {
     processId: number;
     onConfirm: (reason: string) => void;
     onCancel: () => void;
   }

   export function KillDialog({ processId, onConfirm, onCancel }: KillDialogProps) {
     const [reason, setReason] = useState('');

     return (
       <Dialog open>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>确认 Kill 会话</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <p>
               确定要终止 Process ID <strong>{processId}</strong> 的会话吗？
             </p>
             <div>
               <Label>原因（必填）</Label>
               <Textarea
                 value={reason}
                 onChange={(e) => setReason(e.target.value)}
                 placeholder="请输入终止原因..."
                 required
               />
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={onCancel}>
               取消
             </Button>
             <Button
               variant="destructive"
               onClick={() => onConfirm(reason)}
               disabled={!reason.trim()}
             >
               确认 Kill
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     );
   }
   ```

5. 创建 Server Actions / API Routes：
   ```typescript
   // 获取会话列表
   export async function getSessions(serviceId: string, dbRole: string) {
     await requireAdmin();
     const response = await fetch(
       `${EXECUTOR_BASE_URL}/api/v1/sessions?serviceId=${serviceId}&dbRole=${dbRole}`,
       {
         headers: { Authorization: `Bearer ${EXECUTOR_API_TOKEN}` },
       }
     );
     return response.json();
   }

   // Kill 会话
   export async function killSession(
     serviceId: string,
     dbRole: string,
     processId: number,
     reason: string
   ) {
     await requireAdmin();

     const response = await fetch(`${EXECUTOR_BASE_URL}/api/v1/sessions/kill`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${EXECUTOR_API_TOKEN}`,
       },
       body: JSON.stringify({ serviceId, dbRole, processId, reason }),
     });

     const result = await response.json();

     if (result.success) {
       await writeAuditLog({
         action: 'session.kill',
         target_type: 'session',
         target_id: processId.toString(),
         payload: { serviceId, dbRole, reason },
       });
     }

     return result;
   }
   ```

6. 添加筛选功能：
   - 执行时间 > N 秒
   - 数据库筛选
   - SQL 关键字搜索

#### 产出文件

- `apps/console/src/app/(dashboard)/admin/sessions/page.tsx`
- `apps/console/src/components/admin/session-manager.tsx`
- `apps/console/src/components/admin/session-list.tsx`
- `apps/console/src/components/admin/kill-dialog.tsx`
- `apps/console/src/lib/executor/sessions.ts`

#### 验收标准

- [x] 可以选择目标查看会话列表
- [x] 正确显示会话信息
- [x] 执行时间长的会话高亮
- [x] 只能 kill 系统创建的会话
- [x] Kill 需要填写原因
- [x] Kill 后写入审计日志
- [x] 支持自动刷新
