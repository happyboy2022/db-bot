import { getDb } from '@/db';
import { sqlRequests, sqlRequestVersions, sqlStatements, auditLogs } from '@/db/schema';
import { validateSql } from '@sql-ops/shared';
import { eq } from 'drizzle-orm';
import type {
  ValidatedRequestExport,
  ImportResult,
  ImportResponse,
  ExportedRequest,
} from './types';
import { requestExportSchema } from './types';

interface ImportOptions {
  targetId: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Parse and validate an import file
 */
export function parseImportFile(content: string): {
  success: boolean;
  data?: ValidatedRequestExport;
  error?: string;
} {
  try {
    const parsed = JSON.parse(content);
    const validated = requestExportSchema.parse(parsed);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: 'Invalid JSON format' };
    }
    if (error instanceof Error) {
      return { success: false, error: `Validation error: ${error.message}` };
    }
    return { success: false, error: 'Unknown parsing error' };
  }
}

/**
 * Import requests from parsed export data
 */
export async function importRequests(
  data: ValidatedRequestExport,
  options: ImportOptions
): Promise<ImportResponse> {
  const results: ImportResult[] = [];

  for (const request of data.requests) {
    try {
      const result = await importSingleRequest(request, options);
      results.push(result);
    } catch (error) {
      results.push({
        originalId: request.originalId,
        newId: '',
        title: request.title,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const imported = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  return {
    success: failed.length === 0,
    imported,
    failed,
    totalCount: results.length,
    successCount: imported.length,
    failedCount: failed.length,
  };
}

/**
 * Import a single request
 */
async function importSingleRequest(
  request: ExportedRequest,
  options: ImportOptions
): Promise<ImportResult> {
  const { targetId, userId, ipAddress, userAgent } = options;

  // Get the latest version from export
  const latestVersion = request.versions.reduce(
    (latest, current) =>
      current.version > latest.version ? current : latest,
    request.versions[0]
  );

  if (!latestVersion) {
    return {
      originalId: request.originalId,
      newId: '',
      title: request.title,
      success: false,
      error: 'No versions found in export',
    };
  }

  // Re-validate SQL
  const validationResult = validateSql(latestVersion.sqlRaw);
  if (!validationResult.valid) {
    return {
      originalId: request.originalId,
      newId: '',
      title: request.title,
      success: false,
      error: `SQL validation failed: ${validationResult.errors.join(', ')}`,
    };
  }

  // Map exported statements to precheck SQL
  const precheckMap = new Map(
    latestVersion.statements
      .filter((s) => s.precheckSql)
      .map((s) => [s.orderIndex, s.precheckSql])
  );

  // Create records in a transaction
  const result = await getDb().transaction(async (tx) => {
    // Create request
    const [newRequest] = await tx
      .insert(sqlRequests)
      .values({
        targetId,
        createdBy: userId,
        title: request.title,
        description: request.description,
        status: 'PENDING_APPROVAL',
      })
      .returning({ id: sqlRequests.id });

    // Create version
    const [newVersion] = await tx
      .insert(sqlRequestVersions)
      .values({
        requestId: newRequest.id,
        version: 1,
        sqlRaw: latestVersion.sqlRaw,
        validationResult: validationResult as unknown as Record<string, unknown>,
        templateId: null,
        templateSnapshot: null,
        createdBy: userId,
      })
      .returning({ id: sqlRequestVersions.id });

    // Update request with current version
    await tx
      .update(sqlRequests)
      .set({ currentVersionId: newVersion.id })
      .where(eq(sqlRequests.id, newRequest.id));

    // Create statements
    for (const stmt of validationResult.statements) {
      await tx.insert(sqlStatements).values({
        versionId: newVersion.id,
        orderIndex: stmt.index,
        sqlText: stmt.sql,
        type: stmt.type as 'select' | 'update' | 'delete',
        precheckSql: precheckMap.get(stmt.index) || null,
        validationResult: stmt as unknown as Record<string, unknown>,
      });
    }

    // Write audit log
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: 'request.imported',
      targetType: 'request',
      targetId: newRequest.id,
      payload: {
        originalId: request.originalId,
        originalTitle: request.title,
        originalStatus: request.status,
        originalCreatedAt: request.createdAt,
        originalCreatedBy: request.createdByEmail,
        importedVersion: latestVersion.version,
        statementCount: validationResult.statements.length,
      },
      ipAddress,
      userAgent,
    });

    return { requestId: newRequest.id };
  });

  return {
    originalId: request.originalId,
    newId: result.requestId,
    title: request.title,
    success: true,
  };
}

/**
 * Preview import without actually importing
 */
export function previewImport(data: ValidatedRequestExport): {
  requests: Array<{
    originalId: string;
    title: string;
    statementCount: number;
    hasWriteOperations: boolean;
    originalStatus: string;
    validationErrors: string[];
  }>;
  totalCount: number;
  validCount: number;
  invalidCount: number;
} {
  const previews = data.requests.map((request) => {
    const latestVersion = request.versions.reduce(
      (latest, current) =>
        current.version > latest.version ? current : latest,
      request.versions[0]
    );

    const validationResult = latestVersion
      ? validateSql(latestVersion.sqlRaw)
      : { valid: false, errors: ['No version found'], statements: [] };

    const hasWriteOperations = validationResult.statements.some(
      (s) => s.type === 'update' || s.type === 'delete'
    );

    return {
      originalId: request.originalId,
      title: request.title,
      statementCount: validationResult.statements.length,
      hasWriteOperations,
      originalStatus: request.status,
      validationErrors: validationResult.valid ? [] : validationResult.errors,
    };
  });

  const validCount = previews.filter((p) => p.validationErrors.length === 0).length;

  return {
    requests: previews,
    totalCount: previews.length,
    validCount,
    invalidCount: previews.length - validCount,
  };
}
