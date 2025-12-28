'use server';

import { getDb } from '@/db';
import { sqlStatementExecutions, sqlStatements, sqlRequests, sqlRequestVersions, sqlRequestTargets, dbTargets, clusters, auditLogs } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { executeStatement as executeStatementOnExecutor } from '@/lib/executor/client';
import { killSession } from '@/lib/executor/sessions';
import { requireAdmin } from '@/lib/auth';
import { EXECUTABLE_STATUSES, type DbType } from '@sql-ops/shared';

/**
 * Statement execution context
 */
interface StatementContext {
  statementId: string;
  requestId: string;
  versionId: string;
  version: number;
  targetId: string;
  clusterId: string;
  dbType: string;
  code: string;
  sqlText: string;
  type: 'select' | 'update' | 'delete';
}

/**
 * Get statement execution context for a specific target
 * @param statementId - The statement ID to execute
 * @param targetId - The target database ID to execute against (must be associated with the request)
 */
async function getStatementContext(statementId: string, targetId: string): Promise<StatementContext | null> {
  // First, get statement and request info
  const statementResult = await getDb()
    .select({
      statementId: sqlStatements.id,
      sqlText: sqlStatements.sqlText,
      type: sqlStatements.type,
      versionId: sqlStatements.versionId,
      version: sqlRequestVersions.version,
      requestId: sqlRequests.id,
      requestStatus: sqlRequests.status,
      approvedVersionId: sqlRequests.approvedVersionId,
    })
    .from(sqlStatements)
    .innerJoin(sqlRequestVersions, eq(sqlStatements.versionId, sqlRequestVersions.id))
    .innerJoin(sqlRequests, eq(sqlRequestVersions.requestId, sqlRequests.id))
    .where(eq(sqlStatements.id, statementId))
    .limit(1);

  if (statementResult.length === 0) {
    return null;
  }

  const stmt = statementResult[0];

  // Check if request status allows execution
  if (!EXECUTABLE_STATUSES.includes(stmt.requestStatus as 'APPROVED' | 'FAILED')) {
    return null;
  }

  // Check if statement belongs to approved version
  if (stmt.versionId !== stmt.approvedVersionId) {
    return null;
  }

  // Validate that targetId is associated with this request via sql_request_targets
  const targetResult = await getDb()
    .select({
      targetId: sqlRequestTargets.targetId,
      clusterName: clusters.name,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
    })
    .from(sqlRequestTargets)
    .innerJoin(dbTargets, eq(sqlRequestTargets.targetId, dbTargets.id))
    .innerJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .where(
      and(
        eq(sqlRequestTargets.requestId, stmt.requestId),
        eq(sqlRequestTargets.targetId, targetId)
      )
    )
    .limit(1);

  if (targetResult.length === 0) {
    // targetId is not associated with this request
    return null;
  }

  const target = targetResult[0];

  return {
    statementId: stmt.statementId,
    requestId: stmt.requestId,
    versionId: stmt.versionId,
    version: stmt.version,
    targetId: target.targetId,
    clusterId: target.clusterName,
    dbType: target.dbType,
    code: target.code,
    sqlText: stmt.sqlText,
    type: stmt.type,
  };
}

/**
 * Execute a single statement and record execution history
 * @param statementId - The statement ID to execute
 * @param targetId - The target database ID to execute against
 * @param timeoutMs - Execution timeout in milliseconds
 */
export async function executeSingleStatement(
  statementId: string,
  targetId: string,
  timeoutMs: number = 30000
): Promise<{
  success: boolean;
  executionId: string | null;
  error?: string;
}> {
  const user = await requireAdmin();

  // Get statement context with target validation
  const ctx = await getStatementContext(statementId, targetId);
  if (!ctx) {
    return {
      success: false,
      executionId: null,
      error: '无法执行此语句：请求未审批、语句不存在或目标数据库无效',
    };
  }

  // Create execution record with EXECUTING status (including targetId)
  const [execution] = await getDb()
    .insert(sqlStatementExecutions)
    .values({
      statementId: ctx.statementId,
      targetId: ctx.targetId,
      status: 'EXECUTING',
      executedBy: user.id,
      startedAt: new Date(),
    })
    .returning();

  try {
    // Execute statement via executor service
    const result = await executeStatementOnExecutor({
      requestId: ctx.requestId,
      version: ctx.version,
      statementId: ctx.statementId,
      clusterId: ctx.clusterId,
      dbType: ctx.dbType,
      code: ctx.code,
      sql: ctx.sqlText,
      timeoutMs,
    });

    const completedAt = new Date();

    if (result.success) {
      // Update execution record with success
      await getDb()
        .update(sqlStatementExecutions)
        .set({
          status: 'SUCCEEDED',
          result: {
            affectedRows: result.affectedRows,
            rows: result.resultPreview?.rows,
            columns: result.resultPreview?.columns,
            rowCount: result.resultRowCount,
            truncated: result.resultPreview?.truncated,
          },
          durationMs: result.durationMs,
          completedAt,
        })
        .where(eq(sqlStatementExecutions.id, execution.id));

      // Update statement status (for backward compatibility)
      await getDb()
        .update(sqlStatements)
        .set({
          execStatus: 'SUCCEEDED',
          execResult: {
            affectedRows: result.affectedRows,
            rows: result.resultPreview?.rows,
            rowCount: result.resultRowCount,
          },
          durationMs: result.durationMs,
          executedBy: user.id,
          executedAt: completedAt,
        })
        .where(eq(sqlStatements.id, statementId));

      // Update target execution status
      await getDb()
        .update(sqlRequestTargets)
        .set({ execStatus: 'SUCCEEDED' })
        .where(
          and(
            eq(sqlRequestTargets.requestId, ctx.requestId),
            eq(sqlRequestTargets.targetId, ctx.targetId)
          )
        );

      // Write audit log
      await getDb().insert(auditLogs).values({
        actorUserId: user.id,
        action: 'statement.execute',
        targetType: 'statement',
        targetId: statementId,
        payload: {
          executionId: execution.id,
          requestId: ctx.requestId,
          versionId: ctx.versionId,
          version: ctx.version,
          targetId: ctx.targetId,
          sqlText: ctx.sqlText,
          status: 'SUCCEEDED',
          affectedRows: result.affectedRows,
          resultRowCount: result.resultRowCount,
          durationMs: result.durationMs,
        },
      });

      // 刷新缓存，确保界面显示最新状态
      revalidatePath(`/requests/${ctx.requestId}`);
      revalidatePath('/requests');

      return {
        success: true,
        executionId: execution.id,
      };
    } else {
      // Update execution record with failure
      await getDb()
        .update(sqlStatementExecutions)
        .set({
          status: 'FAILED',
          errorMessage: result.errorMessage ?? 'Execution failed',
          durationMs: result.durationMs,
          completedAt,
        })
        .where(eq(sqlStatementExecutions.id, execution.id));

      // Update statement status
      await getDb()
        .update(sqlStatements)
        .set({
          execStatus: 'FAILED',
          execResult: { error: result.errorMessage ?? 'Execution failed' },
          durationMs: result.durationMs,
          executedBy: user.id,
          executedAt: completedAt,
        })
        .where(eq(sqlStatements.id, statementId));

      // Update target execution status
      await getDb()
        .update(sqlRequestTargets)
        .set({ execStatus: 'FAILED' })
        .where(
          and(
            eq(sqlRequestTargets.requestId, ctx.requestId),
            eq(sqlRequestTargets.targetId, ctx.targetId)
          )
        );

      // Write audit log
      await getDb().insert(auditLogs).values({
        actorUserId: user.id,
        action: 'statement.execute',
        targetType: 'statement',
        targetId: statementId,
        payload: {
          executionId: execution.id,
          requestId: ctx.requestId,
          versionId: ctx.versionId,
          version: ctx.version,
          targetId: ctx.targetId,
          sqlText: ctx.sqlText,
          status: 'FAILED',
          error: result.errorMessage,
          durationMs: result.durationMs,
        },
      });

      // 执行失败时也刷新缓存
      revalidatePath(`/requests/${ctx.requestId}`);
      revalidatePath('/requests');

      return {
        success: false,
        executionId: execution.id,
        error: result.errorMessage ?? 'Execution failed',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const completedAt = new Date();

    // Update execution record with failure
    await getDb()
      .update(sqlStatementExecutions)
      .set({
        status: 'FAILED',
        errorMessage,
        completedAt,
      })
      .where(eq(sqlStatementExecutions.id, execution.id));

    // Update statement status
    await getDb()
      .update(sqlStatements)
      .set({
        execStatus: 'FAILED',
        execResult: { error: errorMessage },
        executedBy: user.id,
        executedAt: completedAt,
      })
      .where(eq(sqlStatements.id, statementId));

    // Update target execution status
    await getDb()
      .update(sqlRequestTargets)
      .set({ execStatus: 'FAILED' })
      .where(
        and(
          eq(sqlRequestTargets.requestId, ctx.requestId),
          eq(sqlRequestTargets.targetId, ctx.targetId)
        )
      );

    // 发生异常时也刷新缓存
    revalidatePath(`/requests/${ctx.requestId}`);
    revalidatePath('/requests');

    return {
      success: false,
      executionId: execution.id,
      error: errorMessage,
    };
  }
}

/**
 * Get execution history for a statement
 */
export async function getStatementExecutions(statementId: string): Promise<{
  id: string;
  status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED';
  result: unknown;
  processId: number | null;
  durationMs: number | null;
  executedByEmail: string;
  executedByDisplayName: string | null;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}[]> {
  const { profiles } = await import('@/db/schema');

  const executions = await getDb()
    .select({
      id: sqlStatementExecutions.id,
      status: sqlStatementExecutions.status,
      result: sqlStatementExecutions.result,
      processId: sqlStatementExecutions.processId,
      durationMs: sqlStatementExecutions.durationMs,
      startedAt: sqlStatementExecutions.startedAt,
      completedAt: sqlStatementExecutions.completedAt,
      errorMessage: sqlStatementExecutions.errorMessage,
      executedByEmail: profiles.email,
      executedByDisplayName: profiles.displayName,
    })
    .from(sqlStatementExecutions)
    .innerJoin(profiles, eq(sqlStatementExecutions.executedBy, profiles.id))
    .where(eq(sqlStatementExecutions.statementId, statementId))
    .orderBy(desc(sqlStatementExecutions.startedAt));

  return executions;
}

/**
 * Get the latest execution for a statement
 */
export async function getLatestExecution(statementId: string): Promise<{
  id: string;
  status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED';
  durationMs: number | null;
  startedAt: Date;
  completedAt: Date | null;
} | null> {
  const result = await getDb()
    .select({
      id: sqlStatementExecutions.id,
      status: sqlStatementExecutions.status,
      durationMs: sqlStatementExecutions.durationMs,
      startedAt: sqlStatementExecutions.startedAt,
      completedAt: sqlStatementExecutions.completedAt,
    })
    .from(sqlStatementExecutions)
    .where(eq(sqlStatementExecutions.statementId, statementId))
    .orderBy(desc(sqlStatementExecutions.startedAt))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Check if a statement is currently executing
 */
export async function isStatementExecuting(statementId: string): Promise<boolean> {
  const result = await getDb()
    .select({ id: sqlStatementExecutions.id })
    .from(sqlStatementExecutions)
    .where(
      and(
        eq(sqlStatementExecutions.statementId, statementId),
        eq(sqlStatementExecutions.status, 'EXECUTING')
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Terminate a running execution
 */
export async function terminateExecution(executionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await requireAdmin();

  // Get execution record with target info and request info for cache invalidation
  const executionResult = await getDb()
    .select({
      id: sqlStatementExecutions.id,
      statementId: sqlStatementExecutions.statementId,
      status: sqlStatementExecutions.status,
      processId: sqlStatementExecutions.processId,
      targetId: sqlStatementExecutions.targetId,
      clusterName: clusters.name,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      requestId: sqlRequests.id,
    })
    .from(sqlStatementExecutions)
    .innerJoin(sqlStatements, eq(sqlStatementExecutions.statementId, sqlStatements.id))
    .innerJoin(sqlRequestVersions, eq(sqlStatements.versionId, sqlRequestVersions.id))
    .innerJoin(sqlRequests, eq(sqlRequestVersions.requestId, sqlRequests.id))
    .leftJoin(dbTargets, eq(sqlStatementExecutions.targetId, dbTargets.id))
    .leftJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .where(eq(sqlStatementExecutions.id, executionId))
    .limit(1);

  const execution = executionResult[0];

  if (!execution) {
    return { success: false, error: '执行记录不存在' };
  }

  if (execution.status !== 'EXECUTING') {
    return { success: false, error: '该执行已完成，无法终止' };
  }

  // Try to kill the MySQL process if we have enough info
  let killResult: { success: boolean; message?: string } = { success: false };

  if (execution.processId && execution.clusterName && execution.code && execution.dbType) {
    try {
      const result = await killSession(
        execution.clusterName,
        execution.code,
        execution.processId,
        `用户手动终止执行 ${executionId}`,
        execution.dbType as DbType
      );

      killResult = {
        success: result.success,
        message: result.error || result.message,
      };

      if (!result.success) {
        console.warn(`[terminateExecution] Failed to kill MySQL process ${execution.processId}:`, result.error);
      }
    } catch (error) {
      console.error('[terminateExecution] Error calling killSession:', error);
      killResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } else {
    console.warn(`[terminateExecution] Missing info to kill process: processId=${execution.processId}, cluster=${execution.clusterName}, code=${execution.code}, dbType=${execution.dbType}`);
  }

  // Mark execution as terminated (regardless of whether MySQL kill succeeded)
  await getDb()
    .update(sqlStatementExecutions)
    .set({
      status: 'TERMINATED',
      completedAt: new Date(),
      errorMessage: killResult.success
        ? '用户手动终止'
        : `用户手动终止（进程终止${killResult.message ? '失败: ' + killResult.message : '未执行'}）`,
    })
    .where(eq(sqlStatementExecutions.id, executionId));

  // Update statement status
  await getDb()
    .update(sqlStatements)
    .set({
      execStatus: 'FAILED',
      execResult: { error: '用户手动终止' },
      executedBy: user.id,
      executedAt: new Date(),
    })
    .where(eq(sqlStatements.id, execution.statementId));

  // Write audit log
  await getDb().insert(auditLogs).values({
    actorUserId: user.id,
    action: 'statement.terminate',
    targetType: 'execution',
    targetId: executionId,
    payload: {
      statementId: execution.statementId,
      processId: execution.processId,
      killResult,
    },
  });

  // 终止后刷新缓存
  revalidatePath(`/requests/${execution.requestId}`);
  revalidatePath('/requests');

  return { success: true };
}
