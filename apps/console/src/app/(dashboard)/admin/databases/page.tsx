import { requireAdmin } from '@/lib/auth';
import { getDatabases, type DatabaseFilters } from '@/lib/queries/databases';
import { getEnabledClusters } from '@/lib/queries/clusters';
import { DatabaseList } from '@/components/admin/database-list';

interface DatabasesPageProps {
  searchParams: Promise<{
    search?: string;
    clusterId?: string;
    dbType?: string;
    enabled?: string;
    page?: string;
  }>;
}

export default async function DatabasesPage({ searchParams }: DatabasesPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const filters: DatabaseFilters = {
    search: params.search || null,
    clusterId: params.clusterId || null,
    dbType: params.dbType || null,
    enabled: params.enabled === 'true' ? true : params.enabled === 'false' ? false : null,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 20,
  };

  const [{ databases, total, page, pageSize, totalPages }, clusters] = await Promise.all([
    getDatabases(filters),
    getEnabledClusters(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">数据库管理</h1>
          <p className="mt-1 text-sm text-gray-500">管理各个集群下的数据库目标配置。</p>
        </div>
      </div>

      <DatabaseList
        databases={databases}
        clusters={clusters}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
      />
    </div>
  );
}
