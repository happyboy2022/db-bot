'use server';

import { getDb } from '@/db';
import { sqlRequests, sqlStatements, auditLogs, dbTargets, clusters } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { terminateRequestExecution, killSession } from '@/lib/executor';

/**
 * Get currently executing statement for a request
 */
async function getCurrentExecutingStatement(requestId: string) {
  // Get request with target info
  const requestResult = await getDb()
    .select({
      id: sqlRequests.id,
      approvedVersionId: sqlRequests.approvedVersionId,
      clusterName: clusters.name,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
    })
    .from(sqlRequests)
    .innerJoin(dbTargets, eq(sqlRequests.targetId, dbTargets.id))
    .innerJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .where(eq(sqlRequests.id, requestId))
    .limit(1);

  const request = requestResult[0];
  if (!request || !request.approvedVersionId) {
    return null;
  }

  const approvedVersionId: string = request.approvedVersionId;

  // Find the currently executing statement
  const stmtResult = await getDb()
    .select({
      id: sqlStatements.id,
      orderIndex: sqlStatements.orderIndex,
      processId: sqlStatements.processId,
    })
    .from(sqlStatements)
    .where(
      and(
        eq(sqlStatements.versionId, approvedVersionId),
        eq(sqlStatements.execStatus, 'EXECUTING')
      )
    )
    .limit(1);

  if (stmtResult.length === 0) {
    return null;
  }

  return {
    id: stmtResult[0].id,
    orderIndex: stmtResult[0].orderIndex,
    processId: stmtResult[0].processId,
    versionId: approvedVersionId,
    clusterId: request.clusterName.toLowerCase(),
    dbType: request.dbType,
    code: request.code,
  };
}

/**
 * Skip remaining statements after a given order index
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
 * Terminate an executing request
 * Uses the new request-based termination API with fallback to processId-based termination
 */
export async function terminateExecution(
  requestId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAdmin();

    // Get currently executing statement and request info
    const executingStmt = await getCurrentExecutingStatement(requestId);

    let killSucceeded = false;
    let usedProcessId: number | null = null;

    // Step 1: Try new request-based termination API (uses Redis tracking)
    if (executingStmt) {
      const terminateResult = await terminateRequestExecution(
        executingStmt.clusterId,
        requestId,
        reason,
        user.displayName || user.email || user.id
      );

      if (terminateResult.success && terminateResult.killed) {
        killSucceeded = true;
        usedProcessId = terminateResult.processId;
        console.log(`[terminator] Request ${requestId} terminated via new API, processId: ${usedProcessId}`);
      } else if (terminateResult.success && terminateResult.wasExecuting === false) {
        // Request already completed, no need to kill
        console.log(`[terminator] Request ${requestId} was not executing (already completed)`);
        killSucceeded = true;
      } else if (!terminateResult.success) {
        console.warn(`[terminator] New API failed for ${requestId}: ${terminateResult.error}`);

        // Step 2: Fall back to processId-based termination if we have a processId
        if (executingStmt.processId) {
          console.log(`[terminator] Falling back to processId-based termination for ${requestId}`);
          const killResult = await killSession(
            executingStmt.clusterId,
            executingStmt.code,
            executingStmt.processId,
            reason,
            executingStmt.dbType
          );

          if (killResult.success) {
            killSucceeded = true;
            usedProcessId = executingStmt.processId;
            console.log(`[terminator] Request ${requestId} terminated via processId fallback`);
          } else {
            console.warn(`[terminator] ProcessId fallback also failed: ${killResult.error}`);
            // Continue anyway - the statement might have already completed
          }
        }
      }
    }

    // Update the executing statement to FAILED
    if (executingStmt) {
      await getDb()
        .update(sqlStatements)
        .set({
          execStatus: 'FAILED',
          execResult: { error: `Terminated by user: ${reason}` },
          executedBy: user.id,
          executedAt: new Date(),
        })
        .where(eq(sqlStatements.id, executingStmt.id));

      // Skip remaining statements
      await skipRemainingStatements(executingStmt.versionId, executingStmt.orderIndex);
    }

    // Update request status to TERMINATED
    await getDb()
      .update(sqlRequests)
      .set({
        status: 'TERMINATED',
        updatedAt: new Date(),
      })
      .where(eq(sqlRequests.id, requestId));

    // Write audit log
    await getDb().insert(auditLogs).values({
      actorUserId: user.id,
      action: 'request.terminate',
      targetType: 'request',
      targetId: requestId,
      payload: {
        reason,
        processId: usedProcessId ?? executingStmt?.processId,
        terminatedStatementId: executingStmt?.id,
        method: killSucceeded ? (usedProcessId ? 'request_api' : 'already_completed') : 'fallback_or_failed',
      },
    });

    // 终止后刷新缓存，确保界面显示最新状态
    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/requests');
    revalidatePath('/admin/approvals');

    return { success: true };
  } catch (error) {
    console.error('Terminate execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to terminate execution',
    };
  }
}
