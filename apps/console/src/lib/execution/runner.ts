'use server';

import { getDb } from '@/db';
import { sqlRequests, sqlStatements, auditLogs } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { executeStatement } from '@/lib/executor/client';
import { requireAdmin } from '@/lib/auth';

/**
 * Statement to execute
 */
export interface ExecutionStatement {
  id: string;
  orderIndex: number;
  sqlText: string;
  type: 'select' | 'update' | 'delete';
}

/**
 * Execution context
 */
export interface ExecutionContext {
  requestId: string;
  versionId: string;
  version: number;
  clusterId: string;
  dbType: string;
  code: string;
  statements: ExecutionStatement[];
  timeoutMs: number;
}

/**
 * Statement execution result
 */
export interface StatementResult {
  statementId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  affectedRows?: number | null;
  resultRowCount?: number | null;
  durationMs?: number;
  error?: string;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  success: boolean;
  results: StatementResult[];
  error?: string;
}

// Statement status type
type StatementStatusType = 'PENDING' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

// Request status type
type RequestStatusType =
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'APPROVAL_EXPIRED'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TERMINATED';

/**
 * Update statement execution status
 */
async function updateStatementStatus(
  statementId: string,
  status: StatementStatusType
): Promise<void> {
  await getDb()
    .update(sqlStatements)
    .set({ execStatus: status })
    .where(eq(sqlStatements.id, statementId));
}

/**
 * Update statement execution result
 */
async function updateStatementResult(
  statementId: string,
  userId: string,
  result: {
    status: StatementStatusType;
    execResult?: unknown;
    durationMs?: number;
    processId?: number;
    error?: string;
  }
): Promise<void> {
  await getDb()
    .update(sqlStatements)
    .set({
      execStatus: result.status,
      execResult: result.error ? { error: result.error } : result.execResult,
      durationMs: result.durationMs,
      processId: result.processId,
      executedBy: userId,
      executedAt: new Date(),
    })
    .where(eq(sqlStatements.id, statementId));
}

/**
 * Skip remaining statements after failure
 */
async function skipRemainingStatements(
  versionId: string,
  afterOrderIndex: number
): Promise<void> {
  await getDb()
    .update(sqlStatements)
    .set({ execStatus: 'SKIPPED' })
    .where(
      and(
        eq(sqlStatements.versionId, versionId),
        gt(sqlStatements.orderIndex, afterOrderIndex)
      )
    );
}

/**
 * Update request final status
 */
async function updateRequestStatus(
  requestId: string,
  status: RequestStatusType
): Promise<void> {
  await getDb()
    .update(sqlRequests)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(sqlRequests.id, requestId));
}

/**
 * Write audit log for statement execution
 */
async function writeExecutionAuditLog(
  userId: string,
  statementId: string,
  ctx: ExecutionContext,
  sqlText: string,
  result: StatementResult
): Promise<void> {
  await getDb().insert(auditLogs).values({
    actorUserId: userId,
    action: 'statement.execute',
    targetType: 'statement',
    targetId: statementId,
    payload: {
      requestId: ctx.requestId,
      versionId: ctx.versionId,
      version: ctx.version,
      sqlText,
      status: result.status,
      affectedRows: result.affectedRows,
      resultRowCount: result.resultRowCount,
      durationMs: result.durationMs,
      error: result.error,
    },
  });
}

/**
 * Run execution of all statements in a request
 * Executes statements sequentially, stopping on first failure
 */
export async function runExecution(
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const user = await requireAdmin();
  const results: StatementResult[] = [];
  let failed = false;
  let failedAtIndex = -1;

  for (let i = 0; i < ctx.statements.length; i++) {
    const stmt = ctx.statements[i];

    // If previous statement failed, skip remaining
    if (failed) {
      const skippedResult: StatementResult = {
        statementId: stmt.id,
        status: 'SKIPPED',
      };

      await updateStatementStatus(stmt.id, 'SKIPPED');
      results.push(skippedResult);
      continue;
    }

    // Update status to EXECUTING
    await updateStatementStatus(stmt.id, 'EXECUTING');

    try {
      // Execute statement via executor service
      const execResult = await executeStatement({
        requestId: ctx.requestId,
        version: ctx.version,
        statementId: stmt.id,
        clusterId: ctx.clusterId,
        dbType: ctx.dbType,
        code: ctx.code,
        sql: stmt.sqlText,
        timeoutMs: ctx.timeoutMs,
      });

      if (execResult.success) {
        const successResult: StatementResult = {
          statementId: stmt.id,
          status: 'SUCCEEDED',
          affectedRows: execResult.affectedRows,
          resultRowCount: execResult.resultRowCount,
          durationMs: execResult.durationMs,
        };

        await updateStatementResult(stmt.id, user.id, {
          status: 'SUCCEEDED',
          execResult: {
            affectedRows: execResult.affectedRows,
            resultRowCount: execResult.resultRowCount,
            resultPreview: execResult.resultPreview,
          },
          durationMs: execResult.durationMs,
        });

        await writeExecutionAuditLog(user.id, stmt.id, ctx, stmt.sqlText, successResult);
        results.push(successResult);
      } else {
        failed = true;
        failedAtIndex = i;

        const failedResult: StatementResult = {
          statementId: stmt.id,
          status: 'FAILED',
          durationMs: execResult.durationMs,
          error: execResult.errorMessage ?? 'Execution failed',
        };

        await updateStatementResult(stmt.id, user.id, {
          status: 'FAILED',
          durationMs: execResult.durationMs,
          error: execResult.errorMessage ?? 'Execution failed',
        });

        await writeExecutionAuditLog(user.id, stmt.id, ctx, stmt.sqlText, failedResult);
        results.push(failedResult);
      }
    } catch (error: unknown) {
      failed = true;
      failedAtIndex = i;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const failedResult: StatementResult = {
        statementId: stmt.id,
        status: 'FAILED',
        error: errorMessage,
      };

      await updateStatementResult(stmt.id, user.id, {
        status: 'FAILED',
        error: errorMessage,
      });

      await writeExecutionAuditLog(user.id, stmt.id, ctx, stmt.sqlText, failedResult);
      results.push(failedResult);
    }
  }

  // Skip remaining statements if failed
  if (failed && failedAtIndex >= 0) {
    await skipRemainingStatements(ctx.versionId, failedAtIndex);
  }

  // Update request final status
  const finalStatus = failed ? 'FAILED' : 'SUCCEEDED';
  await updateRequestStatus(ctx.requestId, finalStatus);

  // Write final audit log
  await getDb().insert(auditLogs).values({
    actorUserId: user.id,
    action: failed ? 'request.execute_failed' : 'request.execute_succeeded',
    targetType: 'request',
    targetId: ctx.requestId,
    payload: {
      versionId: ctx.versionId,
      totalStatements: ctx.statements.length,
      succeeded: results.filter((r) => r.status === 'SUCCEEDED').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
    },
  });

  return {
    success: !failed,
    results,
  };
}
