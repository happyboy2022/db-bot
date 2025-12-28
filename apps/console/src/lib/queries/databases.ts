import { getDb } from '@/db';
import { clusters, profiles, dbTargets, sqlRequests } from '@/db/schema';
import { desc, eq, or, ilike, and, count, SQL } from 'drizzle-orm';

export interface DatabaseListItem {
  id: string;
  clusterId: string;
  clusterName: string;
  clusterDisplayName: string;
  dbType: string;
  code: string;
  displayName: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    displayName: string | null;
    email: string;
  };
  requestCount: number;
}

export interface DatabaseFilters {
  search?: string | null;
  clusterId?: string | null;
  dbType?: string | null;
  enabled?: boolean | null;
  page?: number;
  pageSize?: number;
}

export interface PaginatedDatabases {
  databases: DatabaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 获取数据库列表（带分页和筛选）
 */
export async function getDatabases(filters: DatabaseFilters = {}): Promise<PaginatedDatabases> {
  const { search, clusterId, dbType, enabled, page = 1, pageSize = 20 } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions: SQL<unknown>[] = [];

  if (enabled !== null && enabled !== undefined) {
    conditions.push(eq(dbTargets.enabled, enabled));
  }

  if (clusterId) {
    conditions.push(eq(dbTargets.clusterId, clusterId));
  }

  if (dbType) {
    conditions.push(eq(dbTargets.dbType, dbType as 'polardb_mysql' | 'redis' | 'adb'));
  }

  if (search?.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      or(ilike(dbTargets.code, searchTerm), ilike(dbTargets.displayName, searchTerm))!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await getDb()
    .select({ count: count() })
    .from(dbTargets)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  // Get databases with cluster and creator info
  const databaseRows = await getDb()
    .select({
      id: dbTargets.id,
      clusterId: dbTargets.clusterId,
      clusterName: clusters.name,
      clusterDisplayName: clusters.displayName,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      displayName: dbTargets.displayName,
      enabled: dbTargets.enabled,
      createdAt: dbTargets.createdAt,
      updatedAt: dbTargets.updatedAt,
      createdById: dbTargets.createdBy,
      creatorDisplayName: profiles.displayName,
      creatorEmail: profiles.email,
    })
    .from(dbTargets)
    .leftJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .leftJoin(profiles, eq(dbTargets.createdBy, profiles.id))
    .where(whereClause)
    .orderBy(desc(dbTargets.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Get request counts for each database
  const databaseIds = databaseRows.map((d) => d.id);
  const requestCounts = await getDb()
    .select({
      targetId: sqlRequests.targetId,
      count: count(),
    })
    .from(sqlRequests)
    .where(
      databaseIds.length > 0 ? or(...databaseIds.map((id) => eq(sqlRequests.targetId, id))) : undefined
    )
    .groupBy(sqlRequests.targetId);

  const requestCountMap = new Map(requestCounts.map((r) => [r.targetId, r.count]));

  const databaseList: DatabaseListItem[] = databaseRows.map((row) => ({
    id: row.id,
    clusterId: row.clusterId,
    clusterName: row.clusterName || '',
    clusterDisplayName: row.clusterDisplayName || '',
    dbType: row.dbType,
    code: row.code,
    displayName: row.displayName,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: {
      id: row.createdById,
      displayName: row.creatorDisplayName,
      email: row.creatorEmail || '',
    },
    requestCount: requestCountMap.get(row.id) ?? 0,
  }));

  return {
    databases: databaseList,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取单个数据库详情
 */
export async function getDatabaseById(databaseId: string): Promise<DatabaseListItem | null> {
  const [row] = await getDb()
    .select({
      id: dbTargets.id,
      clusterId: dbTargets.clusterId,
      clusterName: clusters.name,
      clusterDisplayName: clusters.displayName,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      displayName: dbTargets.displayName,
      enabled: dbTargets.enabled,
      createdAt: dbTargets.createdAt,
      updatedAt: dbTargets.updatedAt,
      createdById: dbTargets.createdBy,
      creatorDisplayName: profiles.displayName,
      creatorEmail: profiles.email,
    })
    .from(dbTargets)
    .leftJoin(clusters, eq(dbTargets.clusterId, clusters.id))
    .leftJoin(profiles, eq(dbTargets.createdBy, profiles.id))
    .where(eq(dbTargets.id, databaseId))
    .limit(1);

  if (!row) {
    return null;
  }

  // Get request count
  const [requestCountResult] = await getDb()
    .select({ count: count() })
    .from(sqlRequests)
    .where(eq(sqlRequests.targetId, databaseId));

  return {
    id: row.id,
    clusterId: row.clusterId,
    clusterName: row.clusterName || '',
    clusterDisplayName: row.clusterDisplayName || '',
    dbType: row.dbType,
    code: row.code,
    displayName: row.displayName,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: {
      id: row.createdById,
      displayName: row.creatorDisplayName,
      email: row.creatorEmail || '',
    },
    requestCount: requestCountResult?.count ?? 0,
  };
}

/**
 * 检查数据库代号在集群内是否已存在
 */
export async function isDatabaseCodeExists(
  clusterId: string,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await getDb()
    .select({ id: dbTargets.id })
    .from(dbTargets)
    .where(and(eq(dbTargets.clusterId, clusterId), eq(dbTargets.code, code)))
    .limit(1);

  if (existing.length === 0) {
    return false;
  }

  // 如果指定了排除 ID，检查找到的是否为同一条记录
  if (excludeId && existing[0].id === excludeId) {
    return false;
  }

  return true;
}

/**
 * 获取数据库关联的请求数量
 */
export async function getDatabaseRequestCount(databaseId: string): Promise<number> {
  const [result] = await getDb()
    .select({ count: count() })
    .from(sqlRequests)
    .where(eq(sqlRequests.targetId, databaseId));

  return result?.count ?? 0;
}
