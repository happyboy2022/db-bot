'use server';

import { getDb } from '@/db';
import { sqlRequests, sqlStatements, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { executePrecheck } from '@/lib/executor/client';

/**
 * Pre-check input statement
 */
interface PrecheckInputStatement {
  index: number;
  sql: string;
  precheckSql: string;
}

/**
 * Pre-check request parameters
 */
interface RunPrecheckParams {
  clusterId: string;
  dbType: string;
  code: string;
  statements: PrecheckInputStatement[];
}

/**
 * Pre-check result for a statement
 */
interface PrecheckStatementResult {
  index: number;
  precheckSql: string;
  affectedCount: number | null;
  error?: string;
}

/**
 * Pre-check response
 */
interface RunPrecheckResult {
  success: boolean;
  results?: PrecheckStatementResult[];
  error?: string;
}

/**
 * Run pre-check queries for write statements
 * Executes SELECT COUNT queries to determine affected row counts
 */
export async function runPrecheck(params: RunPrecheckParams): Promise<RunPrecheckResult> {
  try {
    await requireAdmin();

    const results: PrecheckStatementResult[] = [];

    for (const stmt of params.statements) {
      if (!stmt.precheckSql) {
        results.push({
          index: stmt.index,
          precheckSql: '',
          affectedCount: 0,
          error: 'No pre-check SQL defined for this statement',
        });
        continue;
      }

      const result = await executePrecheck({
        clusterId: params.clusterId,
        dbType: params.dbType,
        code: params.code,
        sql: stmt.precheckSql,
      });

      results.push({
        index: stmt.index,
        precheckSql: stmt.precheckSql,
        affectedCount: result.affectedRows,
        error: result.success ? undefined : result.errorMessage ?? 'Pre-check failed',
      });
    }

    return {
      success: true,
      results,
    };
  } catch (error) {
    console.error('Pre-check error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pre-check failed',
    };
  }
}

/**
 * Start execution confirmation data
 */
interface ConfirmData {
  inputRequestId: string;
  confirm: string;
  expectedRows: number;
  largeChangeConfirm?: string;
  reason?: string;
}

/**
 * Start execution parameters
 */
interface StartExecutionParams {
  requestId: string;
  versionId: string;
  version: number;
  confirmData: ConfirmData;
}

/**
 * Start execution response
 */
interface StartExecutionResult {
  success: boolean;
  error?: string;
}

/**
 * Start execution of approved request
 * Validates request status, updates status to EXECUTING, and writes audit log
 */
export async function startExecution(
  params: StartExecutionParams
): Promise<StartExecutionResult> {
  try {
    const user = await requireAdmin();

    // Get request with current status
    const requestResult = await getDb()
      .select({
        id: sqlRequests.id,
        status: sqlRequests.status,
        approvedVersionId: sqlRequests.approvedVersionId,
        expiresAt: sqlRequests.expiresAt,
      })
      .from(sqlRequests)
      .where(eq(sqlRequests.id, params.requestId))
      .limit(1);

    if (requestResult.length === 0) {
      return { success: false, error: 'Request not found' };
    }

    const request = requestResult[0];

    // Validate request status
    if (request.status !== 'APPROVED') {
      return { success: false, error: 'Request is not approved' };
    }

    // Validate version matches approved version
    if (request.approvedVersionId !== params.versionId) {
      return { success: false, error: 'Version does not match approved version' };
    }

    // Check if approval has expired
    if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
      // Update status to expired
      await getDb()
        .update(sqlRequests)
        .set({
          status: 'APPROVAL_EXPIRED',
          updatedAt: new Date(),
        })
        .where(eq(sqlRequests.id, params.requestId));

      return { success: false, error: 'Approval has expired' };
    }

    // Validate confirmation data
    const shortRequestId = params.requestId.slice(0, 8);
    if (
      params.confirmData.inputRequestId !== params.requestId &&
      params.confirmData.inputRequestId !== shortRequestId
    ) {
      return { success: false, error: 'Request ID confirmation does not match' };
    }

    if (params.confirmData.confirm !== 'CONFIRM') {
      return { success: false, error: 'Invalid confirmation' };
    }

    // Large change validation
    const isLargeChange = params.confirmData.expectedRows > 1000;
    if (isLargeChange) {
      if (params.confirmData.largeChangeConfirm !== 'CONFIRM_LARGE_CHANGE') {
        return { success: false, error: 'Large change confirmation required' };
      }
      if (!params.confirmData.reason?.trim()) {
        return { success: false, error: 'Reason required for large change' };
      }
    }

    // Update request status to EXECUTING
    await getDb()
      .update(sqlRequests)
      .set({
        status: 'EXECUTING',
        updatedAt: new Date(),
      })
      .where(eq(sqlRequests.id, params.requestId));

    // Update statement statuses to PENDING
    await getDb()
      .update(sqlStatements)
      .set({
        execStatus: 'PENDING',
      })
      .where(eq(sqlStatements.versionId, params.versionId));

    // Write audit log for execution start
    await getDb().insert(auditLogs).values({
      actorUserId: user.id,
      action: 'request.execute_start',
      targetType: 'request',
      targetId: params.requestId,
      payload: {
        versionId: params.versionId,
        version: params.version,
        expectedRows: params.confirmData.expectedRows,
        isLargeChange,
        reason: params.confirmData.reason,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Start execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start execution',
    };
  }
}

/**
 * Execute statements input
 */
interface ExecuteStatementsStatement {
  id: string;
  orderIndex: number;
  sqlText: string;
  type: 'select' | 'update' | 'delete';
}

/**
 * Execute statements parameters
 */
interface ExecuteStatementsParams {
  requestId: string;
  versionId: string;
  version: number;
  clusterId: string;
  dbType: string;
  code: string;
  statements: ExecuteStatementsStatement[];
  timeoutMs: number;
}

/**
 * Statement result
 */
interface StatementResult {
  statementId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  affectedRows?: number | null;
  resultRowCount?: number | null;
  durationMs?: number;
  error?: string;
}

/**
 * Execute statements response
 */
interface ExecuteStatementsResult {
  success: boolean;
  results?: StatementResult[];
  error?: string;
}

/**
 * Execute all statements in a request
 */
export async function executeStatements(
  params: ExecuteStatementsParams
): Promise<ExecuteStatementsResult> {
  try {
    // Import runner dynamically to avoid circular deps
    const { runExecution } = await import('@/lib/execution/runner');

    const result = await runExecution({
      requestId: params.requestId,
      versionId: params.versionId,
      version: params.version,
      clusterId: params.clusterId,
      dbType: params.dbType,
      code: params.code,
      statements: params.statements,
      timeoutMs: params.timeoutMs,
    });

    // 无论成功或失败都刷新缓存，确保界面显示最新状态
    revalidatePath(`/requests/${params.requestId}`);
    revalidatePath('/requests');
    revalidatePath('/admin/approvals');

    return {
      success: result.success,
      results: result.results,
    };
  } catch (error) {
    console.error('Execute statements error:', error);

    // 发生错误时也刷新缓存
    revalidatePath(`/requests/${params.requestId}`);
    revalidatePath('/requests');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}
