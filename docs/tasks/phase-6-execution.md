# 阶段六：执行流程

## 概述

本阶段实现 Console 端的执行功能，包括预检、确认对话框和多语句串行执行。

## 任务列表

### T-017: 执行确认对话框

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-012, T-015**
- **可并行：否**

#### 任务描述

实现执行前的预检和二次确认功能。

参考文档：[执行流程](../specs/execution.md)

#### 详细步骤

1. 创建 Executor API 客户端（`src/lib/executor/client.ts`）：
   ```typescript
   const EXECUTOR_BASE_URL = process.env.EXECUTOR_BASE_URL!;
   const EXECUTOR_API_TOKEN = process.env.EXECUTOR_API_TOKEN!;

   interface ExecuteParams {
     requestId: string;
     version: number;
     statementId: string;
     serviceId: string;
     dbType: string;
     dbRole: string;
     sql: string;
     timeoutMs?: number;
   }

   export async function executeStatement(params: ExecuteParams) {
     const response = await fetch(`${EXECUTOR_BASE_URL}/api/v1/execute`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${EXECUTOR_API_TOKEN}`,
       },
       body: JSON.stringify(params),
     });

     return response.json();
   }
   ```

2. 创建预检结果组件（`src/components/requests/precheck-result.tsx`）：
   ```typescript
   interface PrecheckResultProps {
     statements: Array<{
       index: number;
       sql: string;
       precheckSql: string;
       affectedCount?: number;
       isLargeChange: boolean;
     }>;
   }

   export function PrecheckResult({ statements }: PrecheckResultProps) {
     return (
       <div className="space-y-4">
         {statements.map((stmt) => (
           <div key={stmt.index} className="border rounded p-4">
             <div className="text-sm font-medium">语句 #{stmt.index + 1}</div>
             <div className="text-sm text-muted-foreground truncate">
               {stmt.sql}
             </div>
             <div className="mt-2">
               预计影响: <span className="font-bold">{stmt.affectedCount}</span> 行
               {stmt.isLargeChange && (
                 <span className="ml-2 text-yellow-600">⚠️ 超过 1000 行</span>
               )}
             </div>
           </div>
         ))}
       </div>
     );
   }
   ```

3. 创建确认表单组件（`src/components/requests/execute-confirm-form.tsx`）：
   ```typescript
   interface ExecuteConfirmFormProps {
     requestId: string;
     expectedRowCount: number;
     isLargeChange: boolean;
     onConfirm: (data: ConfirmData) => void;
     onCancel: () => void;
   }

   interface ConfirmData {
     inputRequestId: string;
     confirm: string;
     expectedRows: string;
     largeChangeConfirm?: string;
     reason?: string;
   }

   export function ExecuteConfirmForm({
     requestId,
     expectedRowCount,
     isLargeChange,
     onConfirm,
     onCancel,
   }: ExecuteConfirmFormProps) {
     const [formData, setFormData] = useState<ConfirmData>({
       inputRequestId: '',
       confirm: '',
       expectedRows: '',
     });
     const [errors, setErrors] = useState<string[]>([]);

     function handleSubmit(e: FormEvent) {
       e.preventDefault();
       const newErrors: string[] = [];

       // 验证请求 ID
       if (formData.inputRequestId !== requestId) {
         newErrors.push('请求 ID 不匹配');
       }

       // 验证 CONFIRM
       if (formData.confirm !== 'CONFIRM') {
         newErrors.push('请输入 CONFIRM 确认');
       }

       // 验证期望行数
       const expectedRows = parseInt(formData.expectedRows);
       if (isNaN(expectedRows) || expectedRows !== expectedRowCount) {
         newErrors.push('期望行数不匹配');
       }

       // 大批量确认
       if (isLargeChange) {
         if (formData.largeChangeConfirm !== 'CONFIRM_LARGE_CHANGE') {
           newErrors.push('请输入 CONFIRM_LARGE_CHANGE 确认大批量操作');
         }
         if (!formData.reason?.trim()) {
           newErrors.push('大批量操作必须填写原因');
         }
       }

       if (newErrors.length > 0) {
         setErrors(newErrors);
         return;
       }

       onConfirm(formData);
     }

     return (
       <form onSubmit={handleSubmit} className="space-y-4">
         {/* 表单字段 */}
       </form>
     );
   }
   ```

4. 创建执行对话框（`src/components/requests/execute-dialog.tsx`）：
   ```typescript
   interface ExecuteDialogProps {
     request: Request;
     version: Version;
     statements: Statement[];
     onClose: () => void;
   }

   export function ExecuteDialog({
     request,
     version,
     statements,
     onClose,
   }: ExecuteDialogProps) {
     const [phase, setPhase] = useState<'precheck' | 'confirm' | 'executing'>(
       'precheck'
     );
     const [precheckResults, setPrecheckResults] = useState<PrecheckResult[]>([]);

     // 预检阶段
     async function runPrecheck() {
       const writeStatements = statements.filter(
         (s) => s.type === 'update' || s.type === 'delete'
       );

       const results = [];
       for (const stmt of writeStatements) {
         const result = await executeStatement({
           requestId: request.id,
           version: version.version,
           statementId: stmt.id,
           serviceId: request.serviceId,
           dbType: request.dbType,
           dbRole: request.dbRole,
           sql: stmt.precheckSql!,
         });

         results.push({
           statementId: stmt.id,
           affectedCount: result.result?.rows?.[0]?.affected_count ?? 0,
           isLargeChange:
             (result.result?.rows?.[0]?.affected_count ?? 0) > 1000,
         });
       }

       setPrecheckResults(results);
       setPhase('confirm');
     }

     useEffect(() => {
       runPrecheck();
     }, []);

     // 渲染不同阶段
     if (phase === 'precheck') {
       return <div>正在执行预检...</div>;
     }

     if (phase === 'confirm') {
       return (
         <ExecuteConfirmForm
           requestId={request.id}
           expectedRowCount={totalAffectedCount}
           isLargeChange={precheckResults.some((r) => r.isLargeChange)}
           onConfirm={handleConfirm}
           onCancel={onClose}
         />
       );
     }

     // executing phase in next task
   }
   ```

5. 创建执行 Server Action（`src/app/(dashboard)/requests/[id]/actions.ts`）：
   ```typescript
   'use server';

   export async function startExecution(
     requestId: string,
     confirmData: ConfirmData
   ) {
     await requireAdmin();

     // 验证请求状态
     const request = await getRequest(requestId);
     if (request.status !== 'APPROVED') {
       throw new Error('Request is not approved');
     }

     // 检查是否过期
     if (new Date() > new Date(request.expiresAt)) {
       throw new Error('Approval has expired');
     }

     // 更新状态为 EXECUTING
     await updateRequestStatus(requestId, 'EXECUTING');

     // 写入审计日志
     await writeAuditLog({
       action: 'request.execute_start',
       target_type: 'request',
       target_id: requestId,
       payload: {
         confirmData,
       },
     });

     return { success: true };
   }
   ```

#### 产出文件

- `apps/console/src/lib/executor/client.ts`
- `apps/console/src/components/requests/precheck-result.tsx`
- `apps/console/src/components/requests/execute-confirm-form.tsx`
- `apps/console/src/components/requests/execute-dialog.tsx`
- `apps/console/src/app/(dashboard)/requests/[id]/actions.ts`

#### 验收标准

- [x] 点击执行后显示预检结果
- [x] 正确显示影响行数
- [x] 超过 1000 行显示警告
- [x] 需要输入请求 ID 确认
- [x] 需要输入 CONFIRM 确认
- [x] 需要输入期望行数
- [x] 大批量需要额外确认和原因

---

### T-018: 多语句串行执行

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-017**
- **可并行：否**

#### 任务描述

实现多条 SQL 语句的串行执行，支持失败终止和状态追踪。

参考文档：[执行流程 - 多语句串行执行](../specs/execution.md#5-多语句串行执行)

#### 详细步骤

1. 创建执行运行器（`src/lib/execution/runner.ts`）：
   ```typescript
   import { executeStatement } from '../executor/client';

   interface ExecutionContext {
     requestId: string;
     versionId: string;
     version: number;
     serviceId: string;
     dbType: string;
     dbRole: string;
     statements: Statement[];
     timeoutMs: number;
     onProgress: (progress: ExecutionProgress) => void;
   }

   interface ExecutionProgress {
     currentIndex: number;
     total: number;
     status: 'executing' | 'succeeded' | 'failed' | 'skipped';
     result?: any;
     error?: string;
   }

   export async function runExecution(ctx: ExecutionContext): Promise<{
     success: boolean;
     results: StatementResult[];
   }> {
     const results: StatementResult[] = [];
     let failed = false;

     for (let i = 0; i < ctx.statements.length; i++) {
       const stmt = ctx.statements[i];

       // 如果前面有失败，跳过后续
       if (failed) {
         ctx.onProgress({
           currentIndex: i,
           total: ctx.statements.length,
           status: 'skipped',
         });

         await updateStatementStatus(stmt.id, 'SKIPPED');
         results.push({ statementId: stmt.id, status: 'SKIPPED' });
         continue;
       }

       // 更新状态为执行中
       ctx.onProgress({
         currentIndex: i,
         total: ctx.statements.length,
         status: 'executing',
       });
       await updateStatementStatus(stmt.id, 'EXECUTING');

       try {
         // 执行语句
         const result = await executeStatement({
           requestId: ctx.requestId,
           version: ctx.version,
           statementId: stmt.id,
           serviceId: ctx.serviceId,
           dbType: ctx.dbType,
           dbRole: ctx.dbRole,
           sql: stmt.sqlText,
           timeoutMs: ctx.timeoutMs,
         });

         if (result.success) {
           ctx.onProgress({
             currentIndex: i,
             total: ctx.statements.length,
             status: 'succeeded',
             result: result.result,
           });

           await updateStatementResult(stmt.id, {
             status: 'SUCCEEDED',
             result: result.result,
             processId: result.processId,
             durationMs: result.durationMs,
           });

           results.push({
             statementId: stmt.id,
             status: 'SUCCEEDED',
             result: result.result,
           });
         } else {
           failed = true;
           ctx.onProgress({
             currentIndex: i,
             total: ctx.statements.length,
             status: 'failed',
             error: result.error?.message,
           });

           await updateStatementResult(stmt.id, {
             status: 'FAILED',
             error: result.error?.message,
             durationMs: result.durationMs,
           });

           results.push({
             statementId: stmt.id,
             status: 'FAILED',
             error: result.error,
           });
         }

         // 写入审计日志
         await writeAuditLog({
           action: 'statement.execute',
           target_type: 'statement',
           target_id: stmt.id,
           payload: {
             requestId: ctx.requestId,
             versionId: ctx.versionId,
             sql: stmt.sqlText,
             result,
           },
         });
       } catch (error: any) {
         failed = true;
         ctx.onProgress({
           currentIndex: i,
           total: ctx.statements.length,
           status: 'failed',
           error: error.message,
         });

         await updateStatementResult(stmt.id, {
           status: 'FAILED',
           error: error.message,
         });

         results.push({
           statementId: stmt.id,
           status: 'FAILED',
           error: { message: error.message },
         });
       }
     }

     // 更新请求最终状态
     const finalStatus = failed ? 'FAILED' : 'SUCCEEDED';
     await updateRequestStatus(ctx.requestId, finalStatus);

     return {
       success: !failed,
       results,
     };
   }
   ```

2. 创建执行进度组件（`src/components/requests/execution-progress.tsx`）：
   ```typescript
   interface ExecutionProgressProps {
     statements: Statement[];
     progress: ExecutionProgress;
   }

   export function ExecutionProgress({
     statements,
     progress,
   }: ExecutionProgressProps) {
     return (
       <div className="space-y-2">
         {statements.map((stmt, index) => (
           <div
             key={stmt.id}
             className={cn(
               'flex items-center gap-2 p-2 rounded',
               getStatusStyle(index, progress)
             )}
           >
             <StatusIcon status={getStatusForIndex(index, progress)} />
             <span className="text-sm">语句 #{index + 1}</span>
             <span className="text-xs text-muted-foreground truncate flex-1">
               {stmt.sqlText}
             </span>
             {getResultDisplay(index, progress)}
           </div>
         ))}
       </div>
     );
   }

   function StatusIcon({ status }: { status: string }) {
     switch (status) {
       case 'pending':
         return <Circle className="w-4 h-4" />;
       case 'executing':
         return <Loader2 className="w-4 h-4 animate-spin" />;
       case 'succeeded':
         return <CheckCircle className="w-4 h-4 text-green-500" />;
       case 'failed':
         return <XCircle className="w-4 h-4 text-red-500" />;
       case 'skipped':
         return <MinusCircle className="w-4 h-4 text-gray-400" />;
     }
   }
   ```

3. 创建终止执行功能（`src/lib/execution/terminator.ts`）：
   ```typescript
   export async function terminateExecution(
     requestId: string,
     reason: string
   ): Promise<void> {
     // 1. 获取当前正在执行的语句
     const executingStmt = await getCurrentExecutingStatement(requestId);

     if (executingStmt?.processId) {
       // 2. 调用 Executor kill
       await killSession({
         serviceId: executingStmt.serviceId,
         dbRole: executingStmt.dbRole,
         processId: executingStmt.processId,
         reason,
       });
     }

     // 3. 更新语句状态
     if (executingStmt) {
       await updateStatementResult(executingStmt.id, {
         status: 'FAILED',
         error: `Terminated by user: ${reason}`,
       });
     }

     // 4. 标记后续语句为 SKIPPED
     await skipRemainingStatements(requestId);

     // 5. 更新请求状态
     await updateRequestStatus(requestId, 'TERMINATED');

     // 6. 写入审计日志
     await writeAuditLog({
       action: 'request.terminate',
       target_type: 'request',
       target_id: requestId,
       payload: { reason, processId: executingStmt?.processId },
     });
   }
   ```

4. 更新执行对话框以集成进度显示：
   ```typescript
   // 在 execute-dialog.tsx 中添加 executing 阶段
   if (phase === 'executing') {
     return (
       <div className="space-y-4">
         <ExecutionProgress
           statements={statements}
           progress={executionProgress}
         />
         <Button variant="destructive" onClick={handleTerminate}>
           终止执行
         </Button>
       </div>
     );
   }
   ```

5. 添加终止确认对话框

#### 产出文件

- `apps/console/src/lib/execution/runner.ts`
- `apps/console/src/lib/execution/terminator.ts`
- `apps/console/src/components/requests/execution-progress.tsx`
- 更新 `apps/console/src/components/requests/execute-dialog.tsx`

#### 验收标准

- [x] 按顺序逐条执行语句
- [x] 实时显示执行进度
- [x] 语句执行成功显示结果
- [x] 语句执行失败显示错误
- [x] 失败后后续语句标记为 SKIPPED
- [x] 可以终止正在执行的请求
- [x] 终止后正确更新状态
- [x] 每条语句执行都写入审计日志
