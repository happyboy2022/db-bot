import { getDb } from '@/db';
import { clusters, profiles, dbTargets } from '@/db/schema';
import { desc, eq, or, ilike, and, count, SQL } from 'drizzle-orm';
import { checkClusterEnvStatus } from '@/lib/executor/config';

export interface ClusterListItem {
  id: string;
  name: string; // 集群代号
  displayName: string; // 集群名称
  region: string | null;
  /** @deprecated 使用 envConfigured 替代 */
  hasDopplerToken: boolean;
  /** 环境变量是否已配置 */
  envConfigured: boolean;
  /** 对应的环境变量名 */
  envVarName: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    displayName: string | null;
    email: string;
  };
  targetCount: number;
}

export interface ClusterDetail extends ClusterListItem {
  dopplerTokenEncrypted: string | null;
}

export interface ClusterFilters {
  search?: string | null;
  enabled?: boolean | null;
  page?: number;
  pageSize?: number;
}

export interface PaginatedClusters {
  clusters: ClusterListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 获取集群列表（带分页和筛选）
 */
export async function getClusters(filters: ClusterFilters = {}): Promise<PaginatedClusters> {
  const { search, enabled, page = 1, pageSize = 20 } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions: SQL<unknown>[] = [];

  if (enabled !== null && enabled !== undefined) {
    conditions.push(eq(clusters.enabled, enabled));
  }

  if (search?.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(clusters.name, searchTerm),
        ilike(clusters.displayName, searchTerm),
        ilike(clusters.region, searchTerm)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await getDb()
    .select({ count: count() })
    .from(clusters)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  // Get clusters with creator info
  const clusterRows = await getDb()
    .select({
      id: clusters.id,
      name: clusters.name,
      displayName: clusters.displayName,
      region: clusters.region,
      dopplerTokenEncrypted: clusters.dopplerTokenEncrypted,
      enabled: clusters.enabled,
      createdAt: clusters.createdAt,
      updatedAt: clusters.updatedAt,
      createdById: clusters.createdBy,
      creatorDisplayName: profiles.displayName,
      creatorEmail: profiles.email,
    })
    .from(clusters)
    .leftJoin(profiles, eq(clusters.createdBy, profiles.id))
    .where(whereClause)
    .orderBy(desc(clusters.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Get target counts for each cluster
  const clusterIds = clusterRows.map((c) => c.id);
  const targetCounts = await getDb()
    .select({
      clusterId: dbTargets.clusterId,
      count: count(),
    })
    .from(dbTargets)
    .where(
      clusterIds.length > 0
        ? or(...clusterIds.map((id) => eq(dbTargets.clusterId, id)))
        : undefined
    )
    .groupBy(dbTargets.clusterId);

  const targetCountMap = new Map(targetCounts.map((t) => [t.clusterId, t.count]));

  const clusterList: ClusterListItem[] = clusterRows.map((row) => {
    // 检查环境变量配置状态
    const envStatus = checkClusterEnvStatus(row.name);

    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      region: row.region,
      // 兼容旧代码，保留 hasDopplerToken 但标记为 deprecated
      hasDopplerToken: envStatus.configured,
      envConfigured: envStatus.configured,
      envVarName: envStatus.envVarName,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: {
        id: row.createdById,
        displayName: row.creatorDisplayName,
        email: row.creatorEmail || '',
      },
      targetCount: targetCountMap.get(row.id) ?? 0,
    };
  });

  return {
    clusters: clusterList,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取单个集群详情
 */
export async function getClusterById(clusterId: string): Promise<ClusterDetail | null> {
  const [row] = await getDb()
    .select({
      id: clusters.id,
      name: clusters.name,
      displayName: clusters.displayName,
      region: clusters.region,
      dopplerTokenEncrypted: clusters.dopplerTokenEncrypted,
      enabled: clusters.enabled,
      createdAt: clusters.createdAt,
      updatedAt: clusters.updatedAt,
      createdById: clusters.createdBy,
      creatorDisplayName: profiles.displayName,
      creatorEmail: profiles.email,
    })
    .from(clusters)
    .leftJoin(profiles, eq(clusters.createdBy, profiles.id))
    .where(eq(clusters.id, clusterId))
    .limit(1);

  if (!row) {
    return null;
  }

  // Get target count
  const [targetCountResult] = await getDb()
    .select({ count: count() })
    .from(dbTargets)
    .where(eq(dbTargets.clusterId, clusterId));

  // 检查环境变量配置状态
  const envStatus = checkClusterEnvStatus(row.name);

  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    region: row.region,
    dopplerTokenEncrypted: row.dopplerTokenEncrypted,
    // 兼容旧代码，保留 hasDopplerToken 但标记为 deprecated
    hasDopplerToken: envStatus.configured,
    envConfigured: envStatus.configured,
    envVarName: envStatus.envVarName,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: {
      id: row.createdById,
      displayName: row.creatorDisplayName,
      email: row.creatorEmail || '',
    },
    targetCount: targetCountResult?.count ?? 0,
  };
}

/**
 * 获取所有启用的集群（用于下拉选择器）
 */
export async function getEnabledClusters(): Promise<
  Array<{ id: string; name: string; displayName: string; region: string | null }>
> {
  return getDb()
    .select({
      id: clusters.id,
      name: clusters.name,
      displayName: clusters.displayName,
      region: clusters.region,
    })
    .from(clusters)
    .where(eq(clusters.enabled, true))
    .orderBy(clusters.displayName);
}

/**
 * 根据集群名称（代号）获取集群详情
 */
export async function getClusterByName(name: string): Promise<ClusterDetail | null> {
  const [row] = await getDb()
    .select({
      id: clusters.id,
      name: clusters.name,
      displayName: clusters.displayName,
      region: clusters.region,
      dopplerTokenEncrypted: clusters.dopplerTokenEncrypted,
      enabled: clusters.enabled,
      createdAt: clusters.createdAt,
      updatedAt: clusters.updatedAt,
      createdById: clusters.createdBy,
      creatorDisplayName: profiles.displayName,
      creatorEmail: profiles.email,
    })
    .from(clusters)
    .leftJoin(profiles, eq(clusters.createdBy, profiles.id))
    .where(eq(clusters.name, name))
    .limit(1);

  if (!row) {
    return null;
  }

  // Get target count
  const [targetCountResult] = await getDb()
    .select({ count: count() })
    .from(dbTargets)
    .where(eq(dbTargets.clusterId, row.id));

  // 检查环境变量配置状态
  const envStatus = checkClusterEnvStatus(row.name);

  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    region: row.region,
    dopplerTokenEncrypted: row.dopplerTokenEncrypted,
    // 兼容旧代码，保留 hasDopplerToken 但标记为 deprecated
    hasDopplerToken: envStatus.configured,
    envConfigured: envStatus.configured,
    envVarName: envStatus.envVarName,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: {
      id: row.createdById,
      displayName: row.creatorDisplayName,
      email: row.creatorEmail || '',
    },
    targetCount: targetCountResult?.count ?? 0,
  };
}

/**
 * 检查集群代号是否已存在
 */
export async function isClusterNameExists(name: string, excludeId?: string): Promise<boolean> {
  const existing = await getDb()
    .select({ id: clusters.id })
    .from(clusters)
    .where(eq(clusters.name, name))
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
