import { getDb } from '@/db';
import {
  sqlRequests,
  sqlRequestVersions,
  sqlStatements,
  approvals,
  dbTargets,
  clusters,
  profiles,
} from '@/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import type {
  RequestExport,
  ExportedRequest,
  ExportedVersion,
  ExportedStatement,
  ExportedApproval,
  CsvExportRow,
} from './types';
import { EXPORT_VERSION } from './types';
import type { RequestStatus } from '@/lib/queries/requests';
import type { StatementType, ApprovalDecision } from '@/lib/queries/request-detail';

/**
 * Export requests to JSON format
 */
export async function exportRequestsToJson(
  requestIds: string[],
  exporterEmail: string,
  userId: string,
  isAdmin: boolean
): Promise<RequestExport> {
  const exportedRequests = await getExportableRequests(requestIds, userId, isAdmin);

  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: exporterEmail,
    requests: exportedRequests,
  };
}

/**
 * Export requests to CSV format
 */
export async function exportRequestsToCsv(
  requestIds: string[],
  userId: string,
  isAdmin: boolean
): Promise<string> {
  const rows = await getCsvExportRows(requestIds, userId, isAdmin);

  const headers = [
    'ID',
    'Title',
    'Status',
    'Cluster Name',
    'Cluster Region',
    'Target',
    'DB Type',
    'DB Role',
    'Current Version',
    'Created At',
    'Created By',
  ];

  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.id,
        escapeCsvValue(row.title),
        row.status,
        escapeCsvValue(row.clusterName),
        escapeCsvValue(row.clusterRegion ?? ''),
        escapeCsvValue(row.targetDisplayName),
        row.dbType,
        row.code,
        row.currentVersion,
        row.createdAt,
        row.createdByEmail,
      ].join(',')
    ),
  ];

  return csvLines.join('\n');
}

/**
 * Get exportable requests with full details
 */
async function getExportableRequests(
  requestIds: string[],
  userId: string,
  isAdmin: boolean
): Promise<ExportedRequest[]> {
  if (requestIds.length === 0) {
    return [];
  }

  // Get requests with target and creator info
  const requestsResult = await getDb()
    .select({
      id: sqlRequests.id,
      title: sqlRequests.title,
      description: sqlRequests.description,
      status: sqlRequests.status,
      createdAt: sqlRequests.createdAt,
      createdBy: sqlRequests.createdBy,
      currentVersionId: sqlRequests.currentVersionId,
      clusterName: clusters.name,
      clusterRegion: clusters.region,
      targetDisplayName: dbTargets.displayName,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      createdByEmail: profiles.email,
    })
    .from(sqlRequests)
    .innerJoin(dbTargets, eq(sqlRequests.targetId, dbTargets.id))
    .innerJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .innerJoin(profiles, eq(sqlRequests.createdBy, profiles.id))
    .where(inArray(sqlRequests.id, requestIds));

  // Filter by permission
  const accessibleRequests = requestsResult.filter(
    (r) => isAdmin || r.createdBy === userId
  );

  if (accessibleRequests.length === 0) {
    return [];
  }

  const accessibleIds = accessibleRequests.map((r) => r.id);

  // Get all versions for these requests
  const versionsResult = await getDb()
    .select({
      id: sqlRequestVersions.id,
      requestId: sqlRequestVersions.requestId,
      version: sqlRequestVersions.version,
      sqlRaw: sqlRequestVersions.sqlRaw,
      createdAt: sqlRequestVersions.createdAt,
      createdByEmail: profiles.email,
    })
    .from(sqlRequestVersions)
    .innerJoin(profiles, eq(sqlRequestVersions.createdBy, profiles.id))
    .where(inArray(sqlRequestVersions.requestId, accessibleIds))
    .orderBy(desc(sqlRequestVersions.version));

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
          })
          .from(sqlStatements)
          .where(inArray(sqlStatements.versionId, versionIds))
      : [];

  // Get approvals for all requests
  const approvalsResult = await getDb()
    .select({
      id: approvals.id,
      requestId: approvals.requestId,
      versionId: approvals.versionId,
      decision: approvals.decision,
      comment: approvals.comment,
      createdAt: approvals.createdAt,
      decidedByEmail: profiles.email,
    })
    .from(approvals)
    .innerJoin(profiles, eq(approvals.decidedBy, profiles.id))
    .where(inArray(approvals.requestId, accessibleIds))
    .orderBy(desc(approvals.createdAt));

  // Build version number map
  const versionNumberMap = new Map(
    versionsResult.map((v) => [v.id, v.version])
  );

  // Build statements by version
  const statementsByVersion = new Map<string, ExportedStatement[]>();
  for (const stmt of statementsResult) {
    const existing = statementsByVersion.get(stmt.versionId) || [];
    existing.push({
      orderIndex: stmt.orderIndex,
      sqlText: stmt.sqlText,
      type: stmt.type as StatementType,
      precheckSql: stmt.precheckSql,
    });
    statementsByVersion.set(stmt.versionId, existing);
  }

  // Sort statements by orderIndex
  for (const [key, stmts] of statementsByVersion) {
    statementsByVersion.set(
      key,
      stmts.sort((a, b) => a.orderIndex - b.orderIndex)
    );
  }

  // Build versions by request
  const versionsByRequest = new Map<string, ExportedVersion[]>();
  for (const ver of versionsResult) {
    const existing = versionsByRequest.get(ver.requestId) || [];
    existing.push({
      version: ver.version,
      sqlRaw: ver.sqlRaw,
      createdAt: ver.createdAt.toISOString(),
      createdByEmail: ver.createdByEmail,
      statements: statementsByVersion.get(ver.id) || [],
    });
    versionsByRequest.set(ver.requestId, existing);
  }

  // Build approvals by request
  const approvalsByRequest = new Map<string, ExportedApproval[]>();
  for (const appr of approvalsResult) {
    const existing = approvalsByRequest.get(appr.requestId) || [];
    existing.push({
      versionNumber: versionNumberMap.get(appr.versionId) || 0,
      decision: appr.decision as ApprovalDecision,
      comment: appr.comment,
      decidedByEmail: appr.decidedByEmail,
      createdAt: appr.createdAt.toISOString(),
    });
    approvalsByRequest.set(appr.requestId, existing);
  }

  // Build final export structure
  return accessibleRequests.map((req): ExportedRequest => ({
    originalId: req.id,
    title: req.title,
    description: req.description,
    status: req.status as RequestStatus,
    createdAt: req.createdAt.toISOString(),
    createdByEmail: req.createdByEmail,
    cluster: {
      name: req.clusterName,
      region: req.clusterRegion,
    },
    target: {
      displayName: req.targetDisplayName,
      dbType: req.dbType,
      code: req.code,
    },
    versions: versionsByRequest.get(req.id) || [],
    approvalHistory: approvalsByRequest.get(req.id) || [],
  }));
}

/**
 * Get CSV export rows for requests
 */
async function getCsvExportRows(
  requestIds: string[],
  userId: string,
  isAdmin: boolean
): Promise<CsvExportRow[]> {
  if (requestIds.length === 0) {
    return [];
  }

  const result = await getDb()
    .select({
      id: sqlRequests.id,
      title: sqlRequests.title,
      status: sqlRequests.status,
      currentVersionId: sqlRequests.currentVersionId,
      createdAt: sqlRequests.createdAt,
      createdBy: sqlRequests.createdBy,
      clusterName: clusters.name,
      clusterRegion: clusters.region,
      targetDisplayName: dbTargets.displayName,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      createdByEmail: profiles.email,
    })
    .from(sqlRequests)
    .innerJoin(dbTargets, eq(sqlRequests.targetId, dbTargets.id))
    .innerJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .innerJoin(profiles, eq(sqlRequests.createdBy, profiles.id))
    .where(inArray(sqlRequests.id, requestIds));

  // Filter by permission
  const accessibleRequests = result.filter(
    (r) => isAdmin || r.createdBy === userId
  );

  // Get version numbers
  const versionIds = accessibleRequests
    .map((r) => r.currentVersionId)
    .filter((id): id is string => id !== null);

  const versionsMap = new Map<string, number>();
  if (versionIds.length > 0) {
    const versions = await getDb()
      .select({
        id: sqlRequestVersions.id,
        version: sqlRequestVersions.version,
      })
      .from(sqlRequestVersions)
      .where(inArray(sqlRequestVersions.id, versionIds));

    for (const v of versions) {
      versionsMap.set(v.id, v.version);
    }
  }

  return accessibleRequests.map((r): CsvExportRow => ({
    id: r.id,
    title: r.title,
    status: r.status as RequestStatus,
    clusterName: r.clusterName,
    clusterRegion: r.clusterRegion,
    targetDisplayName: r.targetDisplayName,
    dbType: r.dbType,
    code: r.code,
    currentVersion: r.currentVersionId ? versionsMap.get(r.currentVersionId) || 1 : 1,
    createdAt: r.createdAt.toISOString(),
    createdByEmail: r.createdByEmail,
  }));
}

/**
 * Escape CSV value to handle commas and quotes
 */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
