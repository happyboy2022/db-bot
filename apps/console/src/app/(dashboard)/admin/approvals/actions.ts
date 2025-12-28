'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { sqlRequests, approvals, auditLogs } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { REJECTABLE_STATUSES } from '@sql-ops/shared/constants';

interface ApprovalResult {
  success: boolean;
  error?: string;
}

/**
 * Approve a request
 */
export async function approveRequest(
  requestId: string,
  versionId: string
): Promise<ApprovalResult> {
  const user = await requireAdmin();

  try {
    // Verify request exists and is pending approval
    const [request] = await getDb()
      .select()
      .from(sqlRequests)
      .where(
        and(eq(sqlRequests.id, requestId), eq(sqlRequests.status, 'PENDING_APPROVAL'))
      )
      .limit(1);

    if (!request) {
      return { success: false, error: 'Request not found or not pending approval' };
    }

    // Verify version matches current version
    if (request.currentVersionId !== versionId) {
      return {
        success: false,
        error: 'Version mismatch. The request may have been modified.',
      };
    }

    // Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Update request status
    await getDb()
      .update(sqlRequests)
      .set({
        status: 'APPROVED',
        approvedVersionId: versionId,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(sqlRequests.id, requestId));

    // Create approval record
    await getDb().insert(approvals).values({
      requestId,
      versionId,
      decision: 'APPROVE',
      decidedBy: user.id,
    });

    // Write audit log
    await getDb().insert(auditLogs).values({
      actorUserId: user.id,
      action: 'APPROVE_REQUEST',
      targetType: 'sql_request',
      targetId: requestId,
      payload: { versionId, expiresAt: expiresAt.toISOString() },
    });

    revalidatePath('/admin/approvals');
    revalidatePath(`/requests/${requestId}`);

    return { success: true };
  } catch (error) {
    console.error('Error approving request:', error);
    return { success: false, error: 'Failed to approve request' };
  }
}

/**
 * Reject a request
 * Supports rejecting both PENDING_APPROVAL and APPROVED requests
 */
export async function rejectRequest(
  requestId: string,
  versionId: string,
  reason: string
): Promise<ApprovalResult> {
  const user = await requireAdmin();

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Reason is required for rejection' };
  }

  try {
    // Verify request exists and is in a rejectable status
    const [request] = await getDb()
      .select()
      .from(sqlRequests)
      .where(
        and(
          eq(sqlRequests.id, requestId),
          inArray(sqlRequests.status, REJECTABLE_STATUSES)
        )
      )
      .limit(1);

    if (!request) {
      return { success: false, error: '请求不存在或当前状态不可拒绝' };
    }

    // Verify version matches based on current status
    // For APPROVED requests, check approvedVersionId
    // For PENDING_APPROVAL requests, check currentVersionId
    const expectedVersionId =
      request.status === 'APPROVED'
        ? request.approvedVersionId
        : request.currentVersionId;

    if (expectedVersionId !== versionId) {
      return {
        success: false,
        error: '版本不匹配，请求可能已被修改。',
      };
    }

    const previousStatus = request.status;

    // Update request status and clear approval-related fields
    await getDb()
      .update(sqlRequests)
      .set({
        status: 'REJECTED',
        approvedVersionId: null,
        expiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(sqlRequests.id, requestId));

    // Create approval record
    await getDb().insert(approvals).values({
      requestId,
      versionId,
      decision: 'REJECT',
      comment: reason.trim(),
      decidedBy: user.id,
    });

    // Write audit log with previous status info
    await getDb().insert(auditLogs).values({
      actorUserId: user.id,
      action: 'REJECT_REQUEST',
      targetType: 'sql_request',
      targetId: requestId,
      payload: {
        versionId,
        reason: reason.trim(),
        previousStatus,
      },
    });

    revalidatePath('/admin/approvals');
    revalidatePath(`/requests/${requestId}`);
    revalidatePath('/requests');

    return { success: true };
  } catch (error) {
    console.error('Error rejecting request:', error);
    return { success: false, error: 'Failed to reject request' };
  }
}

/**
 * Request changes to a request
 */
export async function requestChanges(
  requestId: string,
  versionId: string,
  comment: string
): Promise<ApprovalResult> {
  const user = await requireAdmin();

  if (!comment || comment.trim().length === 0) {
    return { success: false, error: 'Comment is required when requesting changes' };
  }

  try {
    // Verify request exists and is pending approval
    const [request] = await getDb()
      .select()
      .from(sqlRequests)
      .where(
        and(eq(sqlRequests.id, requestId), eq(sqlRequests.status, 'PENDING_APPROVAL'))
      )
      .limit(1);

    if (!request) {
      return { success: false, error: 'Request not found or not pending approval' };
    }

    // Verify version matches current version
    if (request.currentVersionId !== versionId) {
      return {
        success: false,
        error: 'Version mismatch. The request may have been modified.',
      };
    }

    // Update request status
    await getDb()
      .update(sqlRequests)
      .set({
        status: 'CHANGES_REQUESTED',
        updatedAt: new Date(),
      })
      .where(eq(sqlRequests.id, requestId));

    // Create approval record
    await getDb().insert(approvals).values({
      requestId,
      versionId,
      decision: 'CHANGES_REQUESTED',
      comment: comment.trim(),
      decidedBy: user.id,
    });

    // Write audit log
    await getDb().insert(auditLogs).values({
      actorUserId: user.id,
      action: 'REQUEST_CHANGES',
      targetType: 'sql_request',
      targetId: requestId,
      payload: { versionId, comment: comment.trim() },
    });

    revalidatePath('/admin/approvals');
    revalidatePath(`/requests/${requestId}`);

    return { success: true };
  } catch (error) {
    console.error('Error requesting changes:', error);
    return { success: false, error: 'Failed to request changes' };
  }
}
