import { getDb } from '@/db';
import { sqlRequests, dbTargets, clusters, profiles, sqlRequestVersions } from '@/db/schema';
import { eq, and, desc, sql, inArray, gte, lte } from 'drizzle-orm';

export type RequestStatus =
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'APPROVAL_EXPIRED'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TERMINATED';

export interface RequestListItem {
  id: string;
  title: string;
  status: RequestStatus;
  clusterName: string;
  clusterRegion: string | null;
  targetDisplayName: string;
  dbType: string;
  code: string;
  hasWriteOperations: boolean;
  currentVersion: number;
  currentVersionId: string | null;
  approvedVersionId: string | null;
  createdAt: Date;
  createdByEmail: string;
  createdByDisplayName: string | null;
}

export interface RequestFilters {
  status?: RequestStatus[];
  clusterId?: string;
  hasWriteOperations?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get requests for a user with filters and pagination
 */
export async function getRequests(
  userId: string,
  filters: RequestFilters = {},
  isAdmin: boolean = false
): Promise<PaginatedResult<RequestListItem>> {
  const { status, clusterId, hasWriteOperations, dateFrom, dateTo, page = 1, pageSize = 10 } = filters;

  // Build conditions
  const conditions = [];

  // Non-admin users can only see their own requests
  if (!isAdmin) {
    conditions.push(eq(sqlRequests.createdBy, userId));
  }

  // Status filter
  if (status && status.length > 0) {
    conditions.push(inArray(sqlRequests.status, status));
  }

  // Cluster filter
  if (clusterId) {
    conditions.push(eq(dbTargets.clusterId, clusterId));
  }

  // Date range filter
  if (dateFrom) {
    conditions.push(gte(sqlRequests.createdAt, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(sqlRequests.createdAt, dateTo));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * pageSize;

  // 并行执行 COUNT 和 SELECT 查询（减少总等待时间）
  const [countResult, result] = await Promise.all([
    // Count total
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(sqlRequests)
      .innerJoin(dbTargets, eq(sqlRequests.targetId, dbTargets.id))
      .where(whereClause),

    // Get paginated data with joins
    getDb()
      .select({
        id: sqlRequests.id,
        title: sqlRequests.title,
        status: sqlRequests.status,
        currentVersionId: sqlRequests.currentVersionId,
        approvedVersionId: sqlRequests.approvedVersionId,
        createdAt: sqlRequests.createdAt,
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
      .where(whereClause)
      .orderBy(desc(sqlRequests.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Get version info for determining hasWriteOperations
  const versionIds = result
    .map((r) => r.currentVersionId)
    .filter((id): id is string => id !== null);

  let versionsMap: Map<string, { version: number; hasWrites: boolean }> = new Map();

  if (versionIds.length > 0) {
    const versions = await getDb()
      .select({
        id: sqlRequestVersions.id,
        version: sqlRequestVersions.version,
        validationResult: sqlRequestVersions.validationResult,
      })
      .from(sqlRequestVersions)
      .where(inArray(sqlRequestVersions.id, versionIds));

    versionsMap = new Map(
      versions.map((v) => [
        v.id,
        {
          version: v.version,
          hasWrites: hasWriteOperationsFromValidation(v.validationResult),
        },
      ])
    );
  }

  const items: RequestListItem[] = result.map((r) => {
    const versionInfo = r.currentVersionId ? versionsMap.get(r.currentVersionId) : undefined;
    return {
      id: r.id,
      title: r.title,
      status: r.status as RequestStatus,
      clusterName: r.clusterName,
      clusterRegion: r.clusterRegion,
      targetDisplayName: r.targetDisplayName,
      dbType: r.dbType,
      code: r.code,
      hasWriteOperations: versionInfo?.hasWrites ?? false,
      currentVersion: versionInfo?.version ?? 1,
      currentVersionId: r.currentVersionId,
      approvedVersionId: r.approvedVersionId,
      createdAt: r.createdAt,
      createdByEmail: r.createdByEmail,
      createdByDisplayName: r.createdByDisplayName,
    };
  });

  // Post-filter hasWriteOperations if specified
  let filteredItems = items;
  if (hasWriteOperations !== undefined) {
    filteredItems = items.filter((item) => item.hasWriteOperations === hasWriteOperations);
  }

  return {
    items: filteredItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get pending approval requests for admin
 */
export async function getPendingRequests(): Promise<RequestListItem[]> {
  const result = await getRequests('', { status: ['PENDING_APPROVAL'] }, true);
  return result.items;
}

/**
 * Check if validation result contains write operations
 */
function hasWriteOperationsFromValidation(validationResult: unknown): boolean {
  if (!validationResult || typeof validationResult !== 'object') {
    return false;
  }

  const result = validationResult as { statements?: Array<{ type?: string }> };
  if (!result.statements || !Array.isArray(result.statements)) {
    return false;
  }

  return result.statements.some((s) => s.type === 'update' || s.type === 'delete');
}
