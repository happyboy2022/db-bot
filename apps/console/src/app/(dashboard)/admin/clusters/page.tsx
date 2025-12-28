import { requireAdmin } from '@/lib/auth';
import { getClusters, type ClusterFilters } from '@/lib/queries/clusters';
import { ClusterList } from '@/components/admin/cluster-list';

interface ClustersPageProps {
  searchParams: Promise<{
    search?: string;
    enabled?: string;
    page?: string;
  }>;
}

export default async function ClustersPage({ searchParams }: ClustersPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const filters: ClusterFilters = {
    search: params.search || null,
    enabled: params.enabled === 'true' ? true : params.enabled === 'false' ? false : null,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 20,
  };

  const { clusters, total, page, pageSize, totalPages } = await getClusters(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">集群管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理数据库集群配置和 Doppler 环境变量。
          </p>
        </div>
      </div>

      <ClusterList
        clusters={clusters}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
      />
    </div>
  );
}
