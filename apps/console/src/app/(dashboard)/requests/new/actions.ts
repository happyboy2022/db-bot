'use server';

import { headers } from 'next/headers';
import { getDb } from '@/db';
import {
  sqlRequests,
  sqlRequestVersions,
  sqlRequestTargets,
  sqlStatements,
  auditLogs,
  sqlTemplates,
} from '@/db/schema';
import { requireActiveUser } from '@/lib/auth';
import { validateSql, statementTypeSchema } from '@sql-ops/shared';
import { eq } from 'drizzle-orm';

interface PrecheckItem {
  statementIndex: number;
  precheckSql: string;
  expectedRows: number | null;
}

interface CreateRequestResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

export async function createRequest(
  formData: FormData
): Promise<CreateRequestResult> {
  try {
    // 1. Verify user authentication and permissions
    const user = await requireActiveUser();

    // 2. Extract form data
    const title = formData.get('title') as string;
    const description = (formData.get('description') as string) || null;
    const targetIdsJson = formData.get('targetIds') as string;
    const sqlRaw = formData.get('sqlRaw') as string;
    const templateId = (formData.get('templateId') as string) || null;
    const prechecksJson = formData.get('prechecks') as string;

    // 3. Parse and validate target IDs
    let targetIds: string[] = [];
    try {
      targetIds = JSON.parse(targetIdsJson || '[]');
    } catch {
      return { success: false, error: '目标数据库配置无效' };
    }

    // 4. Basic validation
    if (!title?.trim()) {
      return { success: false, error: '标题不能为空' };
    }
    if (targetIds.length === 0) {
      return { success: false, error: '请至少选择一个目标数据库' };
    }
    if (!sqlRaw?.trim()) {
      return { success: false, error: 'SQL 不能为空' };
    }

    // Use first target as primary for backward compatibility
    const primaryTargetId = targetIds[0];

    // 4. Re-validate SQL on server side (never trust client)
    const validationResult = validateSql(sqlRaw);
    if (!validationResult.valid) {
      return {
        success: false,
        error: `SQL validation failed: ${validationResult.errors.join(', ')}`,
      };
    }

    // 5. Parse and validate prechecks
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

    // 6. Get template snapshot if template was used
    let templateSnapshot = null;
    if (templateId) {
      const template = await getDb()
        .select()
        .from(sqlTemplates)
        .where(eq(sqlTemplates.id, templateId))
        .limit(1);

      if (template.length > 0) {
        templateSnapshot = {
          id: template[0].id,
          name: template[0].name,
          sqlText: template[0].sqlText,
        };
      }
    }

    // 7. Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // 8. Create records in a transaction
    const result = await getDb().transaction(async (tx) => {
      // Create request (use primary target for backward compatibility)
      const [request] = await tx
        .insert(sqlRequests)
        .values({
          targetId: primaryTargetId,
          createdBy: user.id,
          title: title.trim(),
          description: description?.trim() || null,
          status: 'PENDING_APPROVAL',
        })
        .returning({ id: sqlRequests.id });

      // Create request-target associations
      for (let i = 0; i < targetIds.length; i++) {
        await tx.insert(sqlRequestTargets).values({
          requestId: request.id,
          targetId: targetIds[i],
          orderIndex: i,
        });
      }

      // Create version
      const [version] = await tx
        .insert(sqlRequestVersions)
        .values({
          requestId: request.id,
          version: 1,
          sqlRaw: sqlRaw,
          validationResult: validationResult as unknown as Record<string, unknown>,
          templateId: templateId || null,
          templateSnapshot: templateSnapshot as Record<string, unknown> | null,
          createdBy: user.id,
        })
        .returning({ id: sqlRequestVersions.id });

      // Update request with current version
      await tx
        .update(sqlRequests)
        .set({ currentVersionId: version.id })
        .where(eq(sqlRequests.id, request.id));

      // Create statements with validated types
      for (const stmt of validationResult.statements) {
        const precheck = prechecks.find((p) => p.statementIndex === stmt.index);

        // Validate statement type using Zod schema instead of unsafe type assertion
        const typeValidation = statementTypeSchema.safeParse(stmt.type);
        if (!typeValidation.success) {
          throw new Error(
            `Invalid statement type at index ${stmt.index}: ${typeValidation.error.errors[0]?.message || 'unknown type'}`
          );
        }

        await tx.insert(sqlStatements).values({
          versionId: version.id,
          orderIndex: stmt.index,
          sqlText: stmt.sql,
          type: typeValidation.data,
          precheckSql: precheck?.precheckSql || null,
          validationResult: stmt as unknown as Record<string, unknown>,
        });
      }

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: user.id,
        action: 'request.create',
        targetType: 'request',
        targetId: request.id,
        payload: {
          title: title.trim(),
          targetIds,
          targetCount: targetIds.length,
          statementCount: validationResult.statements.length,
          hasWriteOperations: writeStatements.length > 0,
          templateId: templateId || null,
        },
        ipAddress,
        userAgent,
      });

      return { requestId: request.id };
    });

    return { success: true, requestId: result.requestId };
  } catch (error) {
    console.error('Failed to create request:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred',
    };
  }
}
