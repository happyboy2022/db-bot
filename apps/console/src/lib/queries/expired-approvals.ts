import { getDb } from '@/db';
import { sqlRequests } from '@/db/schema';
import { eq, and, lt, isNotNull } from 'drizzle-orm';

/**
 * Check and update expired approvals to APPROVAL_EXPIRED status
 *
 * This function finds all requests that:
 * 1. Are in APPROVED status
 * 2. Have an expiresAt timestamp that has passed
 *
 * And updates them to APPROVAL_EXPIRED status.
 *
 * @returns Number of requests that were marked as expired
 *
 * @example
 * ```typescript
 * // Run cleanup manually
 * const expiredCount = await checkAndUpdateExpiredApprovals();
 * console.log(`Marked ${expiredCount} requests as expired`);
 *
 * // Use in a cron job or scheduled task
 * setInterval(async () => {
 *   await checkAndUpdateExpiredApprovals();
 * }, 60 * 60 * 1000); // Run every hour
 * ```
 */
export async function checkAndUpdateExpiredApprovals(): Promise<number> {
  const db = getDb();
  const now = new Date();

  // Find and update expired approvals in a single query
  const result = await db
    .update(sqlRequests)
    .set({
      status: 'APPROVAL_EXPIRED',
      updatedAt: now,
    })
    .where(
      and(
        eq(sqlRequests.status, 'APPROVED'),
        isNotNull(sqlRequests.expiresAt),
        lt(sqlRequests.expiresAt, now)
      )
    )
    .returning({ id: sqlRequests.id });

  return result.length;
}

/**
 * Check if a single request's approval has expired
 *
 * This is useful for checking expiration before executing a request.
 * If the approval is expired, it will be automatically updated.
 *
 * @param requestId - The request ID to check
 * @returns true if approval is expired (or was just marked as expired), false otherwise
 *
 * @example
 * ```typescript
 * // Before executing a request, check if approval is still valid
 * const isExpired = await checkSingleRequestExpiration(requestId);
 * if (isExpired) {
 *   throw new Error('Approval has expired');
 * }
 * // Proceed with execution...
 * ```
 */
export async function checkSingleRequestExpiration(
  requestId: string
): Promise<boolean> {
  const db = getDb();
  const now = new Date();

  // Try to update if expired
  const result = await db
    .update(sqlRequests)
    .set({
      status: 'APPROVAL_EXPIRED',
      updatedAt: now,
    })
    .where(
      and(
        eq(sqlRequests.id, requestId),
        eq(sqlRequests.status, 'APPROVED'),
        isNotNull(sqlRequests.expiresAt),
        lt(sqlRequests.expiresAt, now)
      )
    )
    .returning({ id: sqlRequests.id });

  return result.length > 0;
}

/**
 * Get the expiration status for a request
 *
 * @param requestId - The request ID to check
 * @returns Object with expiration details or null if request not found
 *
 * @example
 * ```typescript
 * const status = await getRequestExpirationStatus(requestId);
 * if (status?.isExpired) {
 *   console.log(`Request expired ${status.expiredAgo} ms ago`);
 * }
 * ```
 */
export async function getRequestExpirationStatus(
  requestId: string
): Promise<{
  isApproved: boolean;
  isExpired: boolean;
  expiresAt: Date | null;
  expiredAgo: number | null;
} | null> {
  const db = getDb();

  const [request] = await db
    .select({
      status: sqlRequests.status,
      expiresAt: sqlRequests.expiresAt,
    })
    .from(sqlRequests)
    .where(eq(sqlRequests.id, requestId))
    .limit(1);

  if (!request) {
    return null;
  }

  const isApproved = request.status === 'APPROVED';
  const now = new Date();

  if (!isApproved || !request.expiresAt) {
    return {
      isApproved,
      isExpired: request.status === 'APPROVAL_EXPIRED',
      expiresAt: request.expiresAt,
      expiredAgo: null,
    };
  }

  const isExpired = now > request.expiresAt;
  const expiredAgo = isExpired ? now.getTime() - request.expiresAt.getTime() : null;

  return {
    isApproved,
    isExpired,
    expiresAt: request.expiresAt,
    expiredAgo,
  };
}

/**
 * Get count of requests pending expiration cleanup
 *
 * This is useful for monitoring dashboards.
 *
 * @returns Count of approved requests that should be marked as expired
 */
export async function getExpiredApprovalCount(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const result = await db
    .select({ id: sqlRequests.id })
    .from(sqlRequests)
    .where(
      and(
        eq(sqlRequests.status, 'APPROVED'),
        isNotNull(sqlRequests.expiresAt),
        lt(sqlRequests.expiresAt, now)
      )
    );

  return result.length;
}

/**
 * Set expiration time for a request when it's approved
 *
 * @param requestId - The request ID
 * @param expirationHours - Hours until expiration (default: 24)
 * @returns true if updated successfully, false if request not found
 */
export async function setApprovalExpiration(
  requestId: string,
  expirationHours: number = 24
): Promise<boolean> {
  const db = getDb();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expirationHours);

  const result = await db
    .update(sqlRequests)
    .set({
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(sqlRequests.id, requestId))
    .returning({ id: sqlRequests.id });

  return result.length > 0;
}
