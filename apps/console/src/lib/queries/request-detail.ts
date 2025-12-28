import { getDb } from '@/db';
import {
  sqlRequests,
  sqlRequestVersions,
  sqlRequestTargets,
  sqlStatements,
  approvals,
  dbTargets,
  clusters,
  profiles,
} from '@/db/schema';
import { eq, desc, asc, inArray } from 'drizzle-orm';
import type { RequestStatus } from './requests';

export type StatementType = 'select' | 'update' | 'delete';
export type StatementStatus = 'PENDING' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
export type ApprovalDecision = 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED';

export interface RequestDetailTarget {
  id: string;
  targetId: string;
  clusterName: string;
  clusterDisplayName: string;
  clusterRegion: string | null;
  targetDisplayName: string;
  dbType: string;
  code: string;
  orderIndex: number;
  execStatus: StatementStatus | null;
}

export interface RequestDetailStatement {
  id: string;
  orderIndex: number;
  sqlText: string;
  type: StatementType;
  precheckSql: string | null;
  validationResult: unknown;
  execStatus: StatementStatus | null;
  execResult: unknown;
  durationMs: number | null;
  executedAt: Date | null;
  executedByEmail: string | null;
  executedByDisplayName: string | null;
}

export interface RequestDetailVersion {
  id: string;
  version: number;
  sqlRaw: string;
  validationResult: unknown;
  createdAt: Date;
  createdByEmail: string;
  createdByDisplayName: string | null;
  isCurrentVersion: boolean;
  isApprovedVersion: boolean;
  statements: RequestDetailStatement[];
}

export interface RequestDetailApproval {
  id: string;
  versionId: string;
  versionNumber: number;
  decision: ApprovalDecision;
  comment: string | null;
  decidedByEmail: string;
  decidedByDisplayName: string | null;
  createdAt: Date;
}

export interface RequestDetail {
  id: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Target info (multiple targets)
  targets: RequestDetailTarget[];
  // Primary target info (backward compatibility)
  clusterName: string;
  clusterRegion: string | null;
  targetDisplayName: string;
  dbType: string;
  code: string;
  // Creator info
  createdByEmail: string;
  createdByDisplayName: string | null;
  // Current and approved version
  currentVersionId: string | null;
  approvedVersionId: string | null;
  // Related data
  versions: RequestDetailVersion[];
  approvalHistory: RequestDetailApproval[];
}

/**
 * Get detailed request information including versions, statements, and approvals
 */
export async function getRequestDetail(
  requestId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<RequestDetail | null> {
  // Get request with target and creator info
  const requestResult = await getDb()
    .select({
      id: sqlRequests.id,
      title: sqlRequests.title,
      description: sqlRequests.description,
      status: sqlRequests.status,
      expiresAt: sqlRequests.expiresAt,
      createdAt: sqlRequests.createdAt,
      updatedAt: sqlRequests.updatedAt,
      currentVersionId: sqlRequests.currentVersionId,
      approvedVersionId: sqlRequests.approvedVersionId,
      createdBy: sqlRequests.createdBy,
      clusterName: clusters.name,
      clusterRegion: clusters.region,
      targetDisplayName: dbTargets.displayName,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      createdByEmail: profiles.email,
      createdByDisplayName: profiles.displayName,
    })
    .from(sqlRequests)
    .innerJoin(dbTargets, eq(sqlRequests.targetId, dbTargets.id))
    .innerJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .innerJoin(profiles, eq(sqlRequests.createdBy, profiles.id))
    .where(eq(sqlRequests.id, requestId))
    .limit(1);

  if (requestResult.length === 0) {
    return null;
  }

  const request = requestResult[0];

  // Check permission - non-admin can only see their own requests
  if (!isAdmin && request.createdBy !== userId) {
    return null;
  }

  // 并行获取 targets, versions 和 approvals（这些查询相互独立）
  const [targetsResult, versionsResult, approvalsResult] = await Promise.all([
    // Get all targets for this request
    getDb()
      .select({
        id: sqlRequestTargets.id,
        targetId: sqlRequestTargets.targetId,
        orderIndex: sqlRequestTargets.orderIndex,
        execStatus: sqlRequestTargets.execStatus,
        clusterName: clusters.name,
        clusterDisplayName: clusters.displayName,
        clusterRegion: clusters.region,
        targetDisplayName: dbTargets.displayName,
        dbType: dbTargets.dbType,
        code: dbTargets.code,
      })
      .from(sqlRequestTargets)
      .innerJoin(dbTargets, eq(sqlRequestTargets.targetId, dbTargets.id))
      .innerJoin(clusters, eq(dbTargets.clusterId, clusters.id))
      .where(eq(sqlRequestTargets.requestId, requestId))
      .orderBy(asc(sqlRequestTargets.orderIndex)),

    // Get all versions for this request
    getDb()
      .select({
        id: sqlRequestVersions.id,
        version: sqlRequestVersions.version,
        sqlRaw: sqlRequestVersions.sqlRaw,
        validationResult: sqlRequestVersions.validationResult,
        createdAt: sqlRequestVersions.createdAt,
        createdByEmail: profiles.email,
        createdByDisplayName: profiles.displayName,
      })
      .from(sqlRequestVersions)
      .innerJoin(profiles, eq(sqlRequestVersions.createdBy, profiles.id))
      .where(eq(sqlRequestVersions.requestId, requestId))
      .orderBy(desc(sqlRequestVersions.version)),

    // Get all approvals for this request
    getDb()
      .select({
        id: approvals.id,
        versionId: approvals.versionId,
        decision: approvals.decision,
        comment: approvals.comment,
        createdAt: approvals.createdAt,
        decidedByEmail: profiles.email,
        decidedByDisplayName: profiles.displayName,
      })
      .from(approvals)
      .innerJoin(profiles, eq(approvals.decidedBy, profiles.id))
      .where(eq(approvals.requestId, requestId))
      .orderBy(desc(approvals.createdAt)),
  ]);

  // Get statements for all versions
  const versionIds = versionsResult.map((v) => v.id);
  const statementsResult =
    versionIds.length > 0
      ? await getDb()
          .select({
            id: sqlStatements.id,
            versionId: sqlStatements.versionId,
            orderIndex: sqlStatements.orderIndex,
            sqlText: sqlStatements.sqlText,
            type: sqlStatements.type,
            precheckSql: sqlStatements.precheckSql,
            validationResult: sqlStatements.validationResult,
            execStatus: sqlStatements.execStatus,
            execResult: sqlStatements.execResult,
            durationMs: sqlStatements.durationMs,
            executedAt: sqlStatements.executedAt,
            executedBy: sqlStatements.executedBy,
          })
          .from(sqlStatements)
          .where(
            versionIds.length === 1
              ? eq(sqlStatements.versionId, versionIds[0])
              : inArray(sqlStatements.versionId, versionIds)
          )
      : [];

  // Get executor profiles for statements
  const executorIds = statementsResult
    .map((s) => s.executedBy)
    .filter((id): id is string => id !== null);

  const executorProfiles =
    executorIds.length > 0
      ? await getDb()
          .select({
            id: profiles.id,
            email: profiles.email,
            displayName: profiles.displayName,
          })
          .from(profiles)
          .where(
            executorIds.length === 1
              ? eq(profiles.id, executorIds[0])
              : inArray(profiles.id, executorIds)
          )
      : [];

  const executorMap = new Map(executorProfiles.map((p) => [p.id, p]));

  // Map version IDs to version numbers
  const versionNumberMap = new Map(versionsResult.map((v) => [v.id, v.version]));

  // Build versions with statements
  const versions: RequestDetailVersion[] = versionsResult.map((v) => ({
    id: v.id,
    version: v.version,
    sqlRaw: v.sqlRaw,
    validationResult: v.validationResult,
    createdAt: v.createdAt,
    createdByEmail: v.createdByEmail,
    createdByDisplayName: v.createdByDisplayName,
    isCurrentVersion: v.id === request.currentVersionId,
    isApprovedVersion: v.id === request.approvedVersionId,
    statements: statementsResult
      .filter((s) => s.versionId === v.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => {
        const executor = s.executedBy ? executorMap.get(s.executedBy) : null;
        return {
          id: s.id,
          orderIndex: s.orderIndex,
          sqlText: s.sqlText,
          type: s.type as StatementType,
          precheckSql: s.precheckSql,
          validationResult: s.validationResult,
          execStatus: s.execStatus as StatementStatus | null,
          execResult: s.execResult,
          durationMs: s.durationMs,
          executedAt: s.executedAt,
          executedByEmail: executor?.email ?? null,
          executedByDisplayName: executor?.displayName ?? null,
        };
      }),
  }));

  // Build approval history
  const approvalHistory: RequestDetailApproval[] = approvalsResult.map((a) => ({
    id: a.id,
    versionId: a.versionId,
    versionNumber: versionNumberMap.get(a.versionId) ?? 0,
    decision: a.decision as ApprovalDecision,
    comment: a.comment,
    decidedByEmail: a.decidedByEmail,
    decidedByDisplayName: a.decidedByDisplayName,
    createdAt: a.createdAt,
  }));

  // Build targets list
  const targets: RequestDetailTarget[] = targetsResult.map((t) => ({
    id: t.id,
    targetId: t.targetId,
    clusterName: t.clusterName,
    clusterDisplayName: t.clusterDisplayName,
    clusterRegion: t.clusterRegion,
    targetDisplayName: t.targetDisplayName,
    dbType: t.dbType,
    code: t.code,
    orderIndex: t.orderIndex,
    execStatus: t.execStatus as StatementStatus | null,
  }));

  // Use first target from junction table, or fallback to request's targetId info
  const primaryTarget = targets[0];

  return {
    id: request.id,
    title: request.title,
    description: request.description,
    status: request.status as RequestStatus,
    expiresAt: request.expiresAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    targets,
    // Primary target for backward compatibility
    clusterName: primaryTarget?.clusterName ?? request.clusterName,
    clusterRegion: primaryTarget?.clusterRegion ?? request.clusterRegion,
    targetDisplayName: primaryTarget?.targetDisplayName ?? request.targetDisplayName,
    dbType: primaryTarget?.dbType ?? request.dbType,
    code: primaryTarget?.code ?? request.code,
    createdByEmail: request.createdByEmail,
    createdByDisplayName: request.createdByDisplayName,
    currentVersionId: request.currentVersionId,
    approvedVersionId: request.approvedVersionId,
    versions,
    approvalHistory,
  };
}

/**
 * Data needed for copying a request as a draft
 */
export interface RequestCopyData {
  title: string;
  description: string | null;
  targetId: string;
  targetIds: string[];
  sqlRaw: string;
}

/**
 * Get minimal request data for copying as a new draft
 */
export async function getRequestForCopy(
  requestId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<RequestCopyData | null> {
  // Get request with current version's SQL
  const result = await getDb()
    .select({
      title: sqlRequests.title,
      description: sqlRequests.description,
      targetId: sqlRequests.targetId,
      createdBy: sqlRequests.createdBy,
      sqlRaw: sqlRequestVersions.sqlRaw,
    })
    .from(sqlRequests)
    .innerJoin(
      sqlRequestVersions,
      eq(sqlRequests.currentVersionId, sqlRequestVersions.id)
    )
    .where(eq(sqlRequests.id, requestId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const request = result[0];

  // Check permission - non-admin can only copy their own requests
  if (!isAdmin && request.createdBy !== userId) {
    return null;
  }

  // Get all target IDs from junction table
  const targetsResult = await getDb()
    .select({
      targetId: sqlRequestTargets.targetId,
    })
    .from(sqlRequestTargets)
    .where(eq(sqlRequestTargets.requestId, requestId))
    .orderBy(asc(sqlRequestTargets.orderIndex));

  const targetIds = targetsResult.map((t) => t.targetId);

  return {
    title: request.title,
    description: request.description,
    targetId: request.targetId,
    targetIds: targetIds.length > 0 ? targetIds : [request.targetId],
    sqlRaw: request.sqlRaw,
  };
}
