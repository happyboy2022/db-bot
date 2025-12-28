import { getDb } from '@/db';
import {
  sqlRequests,
  sqlRequestVersions,
  sqlStatements,
  dbTargets,
  clusters,
  profiles,
} from '@/db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import type { RequestStatus } from './requests';
import type { StatementType } from './request-detail';

export interface PendingRequestStatement {
  id: string;
  orderIndex: number;
  sqlText: string;
  type: StatementType;
  precheckSql: string | null;
}

export interface PendingRequestVersion {
  id: string;
  version: number;
  sqlRaw: string;
  statements: PendingRequestStatement[];
}

export interface PendingRequest {
  id: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  createdAt: Date;
  // Creator info
  createdByEmail: string;
  createdByDisplayName: string | null;
  // Target info
  clusterName: string;
  clusterRegion: string | null;
  targetDisplayName: string;
  dbType: string;
  code: string;
  // Version info
  currentVersionId: string | null;
  currentVersion: PendingRequestVersion | null;
  // Flags
  hasWriteOperations: boolean;
  statementCount: number;
}

/**
 * Get all requests pending approval for admin review
 */
export async function getPendingApprovalRequests(): Promise<PendingRequest[]> {
  // Get pending requests
  const requestsResult = await getDb()
    .select({
      id: sqlRequests.id,
      title: sqlRequests.title,
      description: sqlRequests.description,
      status: sqlRequests.status,
      createdAt: sqlRequests.createdAt,
      currentVersionId: sqlRequests.currentVersionId,
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
    .where(eq(sqlRequests.status, 'PENDING_APPROVAL'))
    .orderBy(desc(sqlRequests.createdAt));

  if (requestsResult.length === 0) {
    return [];
  }

  // Get version info
  const versionIds = requestsResult
    .map((r) => r.currentVersionId)
    .filter((id): id is string => id !== null);

  const versionsResult =
    versionIds.length > 0
      ? await getDb()
          .select({
            id: sqlRequestVersions.id,
            version: sqlRequestVersions.version,
            sqlRaw: sqlRequestVersions.sqlRaw,
          })
          .from(sqlRequestVersions)
          .where(inArray(sqlRequestVersions.id, versionIds))
      : [];

  // Get statements for all versions
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
          })
          .from(sqlStatements)
          .where(inArray(sqlStatements.versionId, versionIds))
          .orderBy(sqlStatements.orderIndex)
      : [];

  // Build version map with statements
  const versionMap = new Map<string, PendingRequestVersion>();
  for (const v of versionsResult) {
    const statements = statementsResult
      .filter((s) => s.versionId === v.id)
      .map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        sqlText: s.sqlText,
        type: s.type as StatementType,
        precheckSql: s.precheckSql,
      }));

    versionMap.set(v.id, {
      id: v.id,
      version: v.version,
      sqlRaw: v.sqlRaw,
      statements,
    });
  }

  return requestsResult.map((r) => {
    const version = r.currentVersionId ? versionMap.get(r.currentVersionId) : null;
    const hasWriteOperations = version
      ? version.statements.some((s) => s.type === 'update' || s.type === 'delete')
      : false;

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status as RequestStatus,
      createdAt: r.createdAt,
      createdByEmail: r.createdByEmail,
      createdByDisplayName: r.createdByDisplayName,
      clusterName: r.clusterName,
      clusterRegion: r.clusterRegion,
      targetDisplayName: r.targetDisplayName,
      dbType: r.dbType,
      code: r.code,
      currentVersionId: r.currentVersionId,
      currentVersion: version ?? null,
      hasWriteOperations,
      statementCount: version?.statements.length ?? 0,
    };
  });
}

/**
 * Get a specific request for approval review
 */
export async function getRequestForApproval(requestId: string): Promise<PendingRequest | null> {
  const requests = await getPendingApprovalRequests();
  return requests.find((r) => r.id === requestId) ?? null;
}

/**
 * Get count of pending approval requests
 */
export async function getPendingCount(): Promise<number> {
  const result = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(sqlRequests)
    .where(eq(sqlRequests.status, 'PENDING_APPROVAL'));

  return result[0]?.count ?? 0;
}
