'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import {
  sqlRequests,
  sqlStatements,
  auditLogs,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Retry execution of a failed SQL request
 * Resets the request status to APPROVED and extends the expiration window
 */
export async function retryExecution(
  requestId: string,
  versionId: string
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    // Verify request exists and is in FAILED status
    const [request] = await getDb()
      .select()
      .from(sqlRequests)
      .where(and(eq(sqlRequests.id, requestId), eq(sqlRequests.status, 'FAILED')))
      .limit(1);

    if (!request) {
      return { success: false, error: '请求不存在或当前状态无法重新执行' };
    }

    // Verify version matches
    if (request.approvedVersionId !== versionId) {
      return {
        success: false,
        error: '版本不匹配，请刷新页面后重试',
      };
    }

    // Reset statement execution status
    await getDb()
      .update(sqlStatements)
      .set({
        execStatus: null,
        execResult: null,
        executedBy: null,
        executedAt: null,
        durationMs: null,
      })
      .where(eq(sqlStatements.versionId, versionId));

    // Calculate new expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Update request status to APPROVED
    await getDb()
      .update(sqlRequests)
      .set({
        status: 'APPROVED',
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(sqlRequests.id, requestId));

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // Write audit log
    await getDb().insert(auditLogs).values({
      actorUserId: user.id,
      action: 'RETRY_EXECUTION',
      targetType: 'sql_request',
      targetId: requestId,
      payload: { versionId, expiresAt: expiresAt.toISOString() },
      ipAddress,
      userAgent,
    });

    revalidatePath('/requests');
    revalidatePath(`/requests/${requestId}`);

    return { success: true };
  } catch (error) {
    console.error('Error retrying execution:', error);
    return { success: false, error: '重新执行失败' };
  }
}
