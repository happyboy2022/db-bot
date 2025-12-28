import { unstable_cache } from 'next/cache';
import { getDb } from '@/db';
import { clusters, dbTargets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export interface ClusterOption {
  id: string;
  name: string; // 集群代号
  displayName: string; // 集群名称
  region: string | null;
}

export interface DbTargetOption {
  id: string;
  clusterId: string;
  dbType: string;
  code: string;
  displayName: string;
}

/**
 * Get all enabled clusters for dropdown options (with 5 minute cache)
 */
export const getClusterOptions = unstable_cache(
  async (): Promise<ClusterOption[]> => {
    const result = await getDb()
      .select({
        id: clusters.id,
        name: clusters.name,
        displayName: clusters.displayName,
        region: clusters.region,
      })
      .from(clusters)
      .where(eq(clusters.enabled, true))
      .orderBy(clusters.displayName);

    return result;
  },
  ['clusters-list'],
  { revalidate: 300, tags: ['clusters'] }
);

/**
 * Get all enabled DB targets for a specific cluster (with 5 minute cache)
 */
export const getDbTargetsByCluster = unstable_cache(
  async (clusterId: string): Promise<DbTargetOption[]> => {
    const result = await getDb()
      .select({
        id: dbTargets.id,
        clusterId: dbTargets.clusterId,
        dbType: dbTargets.dbType,
        code: dbTargets.code,
        displayName: dbTargets.displayName,
      })
      .from(dbTargets)
      .where(and(eq(dbTargets.clusterId, clusterId), eq(dbTargets.enabled, true)))
      .orderBy(dbTargets.displayName);

    return result;
  },
  ['db-targets-by-cluster'],
  { revalidate: 300, tags: ['db-targets'] }
);

/**
 * Get all enabled clusters with their targets
 */
export async function getClustersWithTargets(): Promise<
  Array<ClusterOption & { targets: DbTargetOption[] }>
> {
  const clustersResult = await getClusterOptions();
  const targetsResult = await getDb()
    .select({
      id: dbTargets.id,
      clusterId: dbTargets.clusterId,
      dbType: dbTargets.dbType,
      code: dbTargets.code,
      displayName: dbTargets.displayName,
    })
    .from(dbTargets)
    .where(eq(dbTargets.enabled, true));

  return clustersResult.map((cluster) => ({
    ...cluster,
    targets: targetsResult.filter((t) => t.clusterId === cluster.id),
  }));
}
