'use server';

import { headers } from 'next/headers';
import { getDb } from '@/db';
import {
  sqlRequests,
  sqlRequestVersions,
  sqlStatements,
  auditLogs,
} from '@/db/schema';
import { requireActiveUser } from '@/lib/auth';
import { validateSql } from '@sql-ops/shared';
import { eq, desc } from 'drizzle-orm';

interface PrecheckItem {
  statementIndex: number;
  precheckSql: string;
  expectedRows: number | null;
}

interface UpdateRequestResult {
  success: boolean;
  error?: string;
  newVersionCreated?: boolean;
}

// States that allow modification
const MODIFIABLE_STATES = [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVAL_EXPIRED',
  'FAILED',
];

export async function updateRequest(
  requestId: string,
  formData: FormData
): Promise<UpdateRequestResult> {
  try {
    // 1. Verify user authentication and permissions
    const user = await requireActiveUser();

    // 2. Get request and verify ownership/state
    const [request] = await getDb()
      .select({
        id: sqlRequests.id,
        createdBy: sqlRequests.createdBy,
        status: sqlRequests.status,
        title: sqlRequests.title,
        description: sqlRequests.description,
        currentVersionId: sqlRequests.currentVersionId,
      })
      .from(sqlRequests)
      .where(eq(sqlRequests.id, requestId))
      .limit(1);

    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.createdBy !== user.id) {
      return { success: false, error: 'You can only modify your own requests' };
    }

    if (!MODIFIABLE_STATES.includes(request.status)) {
      return {
        success: false,
        error: `Cannot modify request in ${request.status} state`,
      };
    }

    // 3. Extract form data
    const title = formData.get('title') as string;
    const description = (formData.get('description') as string) || null;
    const sqlRaw = formData.get('sqlRaw') as string;
    const prechecksJson = formData.get('prechecks') as string;

    // 4. Basic validation
    if (!title?.trim()) {
      return { success: false, error: 'Title is required' };
    }
    if (!sqlRaw?.trim()) {
      return { success: false, error: 'SQL is required' };
    }

    // 5. Re-validate SQL on server side
    const validationResult = validateSql(sqlRaw);
    if (!validationResult.valid) {
      return {
        success: false,
        error: `SQL validation failed: ${validationResult.errors.join(', ')}`,
      };
    }

    // 6. Parse and validate prechecks
    let prechecks: PrecheckItem[] = [];
    try {
      prechecks = JSON.parse(prechecksJson || '[]');
    } catch {
      return { success: false, error: 'Invalid precheck configuration' };
    }

    // Verify all write statements have precheck SQL
    const writeStatements = validationResult.statements.filter(
      (s) => s.requiresPrecheck
    );
    for (const stmt of writeStatements) {
      const precheck = prechecks.find((p) => p.statementIndex === stmt.index);
      if (!precheck?.precheckSql?.trim()) {
        return {
          success: false,
          error: `Statement #${stmt.index + 1} requires precheck SQL`,
        };
      }
    }

    // 7. Get current version to compare SQL
    let currentSqlRaw: string | null = null;
    if (request.currentVersionId) {
      const [currentVersion] = await getDb()
        .select({ sqlRaw: sqlRequestVersions.sqlRaw })
        .from(sqlRequestVersions)
        .where(eq(sqlRequestVersions.id, request.currentVersionId))
        .limit(1);
      currentSqlRaw = currentVersion?.sqlRaw ?? null;
    }

    // Check if SQL content changed
    const sqlChanged = currentSqlRaw !== sqlRaw;

    // 8. Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // 9. Update records in a transaction
    await getDb().transaction(async (tx) => {
      if (sqlChanged) {
        // Get next version number
        const [latestVersion] = await tx
          .select({ version: sqlRequestVersions.version })
          .from(sqlRequestVersions)
          .where(eq(sqlRequestVersions.requestId, requestId))
          .orderBy(desc(sqlRequestVersions.version))
          .limit(1);

        const nextVersion = (latestVersion?.version ?? 0) + 1;

        // Create new version
        const [newVersion] = await tx
          .insert(sqlRequestVersions)
          .values({
            requestId: requestId,
            version: nextVersion,
            sqlRaw: sqlRaw,
            validationResult: validationResult as unknown as Record<string, unknown>,
            createdBy: user.id,
          })
          .returning({ id: sqlRequestVersions.id });

        // Create statements for new version
        for (const stmt of validationResult.statements) {
          const precheck = prechecks.find((p) => p.statementIndex === stmt.index);

          await tx.insert(sqlStatements).values({
            versionId: newVersion.id,
            orderIndex: stmt.index,
            sqlText: stmt.sql,
            type: stmt.type as 'select' | 'update' | 'delete',
            precheckSql: precheck?.precheckSql || null,
            validationResult: stmt as unknown as Record<string, unknown>,
          });
        }

        // Update request with new version, clear approval, set status
        await tx
          .update(sqlRequests)
          .set({
            title: title.trim(),
            description: description?.trim() || null,
            currentVersionId: newVersion.id,
            approvedVersionId: null, // Clear approval when SQL changes
            status: 'PENDING_APPROVAL',
            expiresAt: null, // Clear expiration
            updatedAt: new Date(),
          })
          .where(eq(sqlRequests.id, requestId));

        // Write audit log
        await tx.insert(auditLogs).values({
          actorUserId: user.id,
          action: 'request.update',
          targetType: 'request',
          targetId: requestId,
          payload: {
            title: title.trim(),
            sqlChanged: true,
            newVersion: nextVersion,
            previousVersion: latestVersion?.version ?? 1,
            statementCount: validationResult.statements.length,
            hasWriteOperations: writeStatements.length > 0,
          },
          ipAddress,
          userAgent,
        });
      } else {
        // Only update metadata, no new version
        await tx
          .update(sqlRequests)
          .set({
            title: title.trim(),
            description: description?.trim() || null,
            status: 'PENDING_APPROVAL',
            updatedAt: new Date(),
          })
          .where(eq(sqlRequests.id, requestId));

        // Write audit log
        await tx.insert(auditLogs).values({
          actorUserId: user.id,
          action: 'request.update',
          targetType: 'request',
          targetId: requestId,
          payload: {
            title: title.trim(),
            sqlChanged: false,
            metadataOnly: true,
          },
          ipAddress,
          userAgent,
        });
      }
    });

    return { success: true, newVersionCreated: sqlChanged };
  } catch (error) {
    console.error('Failed to update request:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred',
    };
  }
}
