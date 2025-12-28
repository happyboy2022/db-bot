import { getDb } from '@/db';
import {
  sqlRequests,
  sqlRequestVersions,
  sqlStatements,
  dbTargets,
  clusters,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface ExecutionStatement {
  id: string;
  orderIndex: number;
  sqlText: string;
  type: 'select' | 'update' | 'delete';
  precheckSql: string | null;
}

export interface RequestForExecution {
  id: string;
  title: string;
  status: string;
  expiresAt: Date | null;
  approvedVersionId: string | null;
  approvedVersion: number;
  clusterName: string;
  dbType: string;
  code: string;
  statements: ExecutionStatement[];
}

/**
 * Get request data needed for execution
 */
export async function getRequestForExecution(
  requestId: string
): Promise<RequestForExecution | null> {
  // Get request with target info
  const requestResult = await getDb()
    .select({
      id: sqlRequests.id,
      title: sqlRequests.title,
      status: sqlRequests.status,
      expiresAt: sqlRequests.expiresAt,
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

  if (requestResult.length === 0) {
    return null;
  }

  const request = requestResult[0];

  // If no approved version, return early
  if (!request.approvedVersionId) {
    return {
      id: request.id,
      title: request.title,
      status: request.status,
      expiresAt: request.expiresAt,
      approvedVersionId: null,
      approvedVersion: 0,
      clusterName: request.clusterName,
      dbType: request.dbType,
      code: request.code,
      statements: [],
    };
  }

  // Get version number
  const versionResult = await getDb()
    .select({
      version: sqlRequestVersions.version,
    })
    .from(sqlRequestVersions)
    .where(eq(sqlRequestVersions.id, request.approvedVersionId))
    .limit(1);

  const approvedVersion = versionResult[0]?.version ?? 0;

  // Get statements for approved version
  const statementsResult = await getDb()
    .select({
      id: sqlStatements.id,
      orderIndex: sqlStatements.orderIndex,
      sqlText: sqlStatements.sqlText,
      type: sqlStatements.type,
      precheckSql: sqlStatements.precheckSql,
    })
    .from(sqlStatements)
    .where(eq(sqlStatements.versionId, request.approvedVersionId))
    .orderBy(sqlStatements.orderIndex);

  return {
    id: request.id,
    title: request.title,
    status: request.status,
    expiresAt: request.expiresAt,
    approvedVersionId: request.approvedVersionId,
    approvedVersion,
    clusterName: request.clusterName,
    dbType: request.dbType,
    code: request.code,
    statements: statementsResult.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      sqlText: s.sqlText,
      type: s.type as 'select' | 'update' | 'delete',
      precheckSql: s.precheckSql,
    })),
  };
}
