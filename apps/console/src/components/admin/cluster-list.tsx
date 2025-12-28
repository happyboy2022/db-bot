'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ClusterListItem } from '@/lib/queries/clusters';
import { ClusterDialog } from './cluster-dialog';
import { ClusterDeleteDialog } from './cluster-delete-dialog';
import { ClusterConfigCheckDialog } from './cluster-config-check-dialog';
import { toggleCluster, deleteCluster, testClusterEnvToken } from '@/app/(dashboard)/admin/clusters/actions';

interface ClusterListProps {
  clusters: ClusterListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ClusterList({
  clusters,
  total,
  page,
  pageSize,
  totalPages,
}: ClusterListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCluster, setEditingCluster] = useState<ClusterListItem | null>(null);
  const [deletingCluster, setDeletingCluster] = useState<ClusterListItem | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [testingClusterId, setTestingClusterId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [checkingCluster, setCheckingCluster] = useState<ClusterListItem | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput.trim()) {
      params.set('search', searchInput.trim());
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.push(`/admin/clusters?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/clusters?${params.toString()}`);
  };

  const handleToggle = (cluster: ClusterListItem) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleCluster(cluster.id, !cluster.enabled);
      if (!result.success) {
        setError(result.error || '切换集群状态失败');
      }
    });
  };

  const handleDelete = (cluster: ClusterListItem) => {
    setDeletingCluster(cluster);
  };

  const confirmDeleteAction = (confirmationCode: string) => {
    if (!deletingCluster) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCluster(deletingCluster.id, confirmationCode);
      if (!result.success) {
        setError(result.error || '删除集群失败');
      }
      setDeletingCluster(null);
    });
  };

  const handleTestConnection = async (cluster: ClusterListItem) => {
    setTestingClusterId(cluster.id);
    setTestResults((prev) => {
      const newResults = { ...prev };
      delete newResults[cluster.id];
      return newResults;
    });

    try {
      const result = await testClusterEnvToken(cluster.name);
      setTestResults((prev) => ({
        ...prev,
        [cluster.id]: {
          success: result.success,
          message: result.success
            ? `连接成功，共 ${result.data?.secretCount} 个配置项`
            : result.error || '测试失败',
        },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [cluster.id]: {
          success: false,
          message: '测试连接时发生错误',
        },
      }));
    } finally {
      setTestingClusterId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索集群..."
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            搜索
          </button>
        </form>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          添加集群
        </button>
      </div>

      {clusters.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-gray-500">未找到集群。</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    集群
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    区域
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    环境变量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    数据库目标
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    创建时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {clusters.map((cluster) => (
                  <tr
                    key={cluster.id}
                    className={`hover:bg-gray-50 ${!cluster.enabled ? 'opacity-60' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">
                          {cluster.displayName}
                        </div>
                        <div className="text-sm text-gray-500">
                          <code className="rounded bg-gray-100 px-1">{cluster.name}</code>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {cluster.region || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              cluster.envConfigured
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {cluster.envConfigured ? '已配置' : '未配置'}
                          </span>
                          {cluster.envConfigured && (
                            <button
                              onClick={() => handleTestConnection(cluster)}
                              disabled={testingClusterId === cluster.id}
                              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              {testingClusterId === cluster.id ? '测试中...' : '测试'}
                            </button>
                          )}
                        </div>
                        <code className="text-xs text-gray-400 font-mono truncate max-w-[150px]" title={cluster.envVarName}>
                          {cluster.envVarName}
                        </code>
                        {testResults[cluster.id] && (
                          <span
                            className={`text-xs ${
                              testResults[cluster.id].success
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {testResults[cluster.id].success ? '✓' : '✗'} {testResults[cluster.id].message}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {cluster.targetCount} 个
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          cluster.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {cluster.enabled ? '已启用' : '已禁用'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDate(cluster.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setCheckingCluster(cluster)}
                          disabled={isPending}
                          className="text-sm text-purple-600 hover:text-purple-800 disabled:opacity-50"
                        >
                          检测
                        </button>
                        <button
                          onClick={() => setEditingCluster(cluster)}
                          disabled={isPending}
                          className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleToggle(cluster)}
                          disabled={isPending}
                          className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                        >
                          {cluster.enabled ? '禁用' : '启用'}
                        </button>
                        <button
                          onClick={() => handleDelete(cluster)}
                          disabled={isPending || cluster.targetCount > 0}
                          title={
                            cluster.targetCount > 0
                              ? '请先删除该集群下的数据库目标'
                              : undefined
                          }
                          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-lg border bg-white px-6 py-3">
            <div className="text-sm text-gray-500">
              显示第 {(page - 1) * pageSize + 1} 到 {Math.min(page * pageSize, total)} 条，共{' '}
              {total} 个集群
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1 || isPending}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              >
                上一页
              </button>
              <span className="flex items-center px-3 text-sm">
                第 {page} 页 / 共 {totalPages} 页
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages || isPending}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      {(showCreateDialog || editingCluster) && (
        <ClusterDialog
          cluster={editingCluster}
          onClose={() => {
            setShowCreateDialog(false);
            setEditingCluster(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingCluster && (
        <ClusterDeleteDialog
          cluster={deletingCluster}
          isPending={isPending}
          onConfirm={confirmDeleteAction}
          onCancel={() => setDeletingCluster(null)}
        />
      )}

      {/* Config Check Dialog */}
      {checkingCluster && (
        <ClusterConfigCheckDialog
          clusterName={checkingCluster.name}
          clusterDisplayName={checkingCluster.displayName}
          onClose={() => setCheckingCluster(null)}
        />
      )}
    </div>
  );
}
