'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DatabaseListItem } from '@/lib/queries/databases';
import { DatabaseDialog } from './database-dialog';
import { DatabaseDeleteDialog } from './database-delete-dialog';
import { DatabaseConfigCheckDialog } from './database-config-check-dialog';
import { toggleDatabase, deleteDatabase } from '@/app/(dashboard)/admin/databases/actions';
import {
  DB_TARGET_TYPES,
  DB_TYPE_LABELS,
  getDbTargetTypeKey,
  type DbType,
} from '@sql-ops/shared';

interface ClusterOption {
  id: string;
  name: string;
  displayName: string;
  region: string | null;
}

interface DatabaseListProps {
  databases: DatabaseListItem[];
  clusters: ClusterOption[];
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

/**
 * 获取数据库目标类型的环境变量名
 */
function getEnvVarForDatabase(dbType: string, code: string): string | null {
  const typeKey = getDbTargetTypeKey(dbType, code);
  if (typeKey) {
    return DB_TARGET_TYPES[typeKey].envVar;
  }
  return null;
}

export function DatabaseList({
  databases,
  clusters,
  total,
  page,
  pageSize,
  totalPages,
}: DatabaseListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingDatabase, setDeletingDatabase] = useState<DatabaseListItem | null>(null);
  const [checkingDatabase, setCheckingDatabase] = useState<DatabaseListItem | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchInput.trim()) {
      params.set('search', searchInput.trim());
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.push(`/admin/databases?${params.toString()}`);
  };

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`/admin/databases?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/databases?${params.toString()}`);
  };

  const handleToggle = (database: DatabaseListItem) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleDatabase(database.id, !database.enabled);
      if (!result.success) {
        setError(result.error || '切换数据库状态失败');
      }
    });
  };

  const handleDelete = (database: DatabaseListItem) => {
    setDeletingDatabase(database);
  };

  const confirmDeleteAction = (confirmationCode: string) => {
    if (!deletingDatabase) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDatabase(deletingDatabase.id, confirmationCode);
      if (!result.success) {
        setError(result.error || '删除数据库失败');
      }
      setDeletingDatabase(null);
    });
  };

  // 数据库类型过滤选项
  const dbTypeOptions: { value: DbType; label: string }[] = [
    { value: 'polardb_mysql', label: DB_TYPE_LABELS.polardb_mysql },
    { value: 'adb', label: DB_TYPE_LABELS.adb },
    { value: 'redis', label: DB_TYPE_LABELS.redis },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Search, Filters and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索数据库..."
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              搜索
            </button>
          </form>

          {/* Cluster filter */}
          <select
            value={searchParams.get('clusterId') || ''}
            onChange={(e) => handleFilterChange('clusterId', e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">所有集群</option>
            {clusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.displayName}
              </option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={searchParams.get('dbType') || ''}
            onChange={(e) => handleFilterChange('dbType', e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">所有类型</option>
            {dbTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={searchParams.get('enabled') || ''}
            onChange={(e) => handleFilterChange('enabled', e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">所有状态</option>
            <option value="true">已启用</option>
            <option value="false">已禁用</option>
          </select>
        </div>

        <button
          onClick={() => setShowCreateDialog(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          添加数据库
        </button>
      </div>

      {databases.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-gray-500">未找到数据库。</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    数据库
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    集群
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    类型
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    环境变量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    请求数
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
                {databases.map((database) => {
                  const envVar = getEnvVarForDatabase(database.dbType, database.code);
                  return (
                    <tr
                      key={database.id}
                      className={`hover:bg-gray-50 ${!database.enabled ? 'opacity-60' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{database.displayName}</div>
                          <div className="text-sm text-gray-500">
                            <code className="rounded bg-gray-100 px-1">{database.code}</code>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div>
                          <div className="text-sm text-gray-900">{database.clusterDisplayName}</div>
                          <div className="text-xs text-gray-500">
                            <code className="rounded bg-gray-100 px-1">{database.clusterName}</code>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                          {DB_TYPE_LABELS[database.dbType as DbType] || database.dbType}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {envVar && (
                          <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                            {envVar}
                          </code>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {database.requestCount} 个
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            database.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {database.enabled ? '已启用' : '已禁用'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {formatDate(database.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setCheckingDatabase(database)}
                            disabled={isPending}
                            className="text-sm text-purple-600 hover:text-purple-800 disabled:opacity-50"
                          >
                            检测
                          </button>
                          <button
                            onClick={() => handleToggle(database)}
                            disabled={isPending}
                            className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                          >
                            {database.enabled ? '禁用' : '启用'}
                          </button>
                          <button
                            onClick={() => handleDelete(database)}
                            disabled={isPending || database.requestCount > 0}
                            title={
                              database.requestCount > 0
                                ? '该数据库有关联的 SQL 请求，无法删除'
                                : undefined
                            }
                            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-lg border bg-white px-6 py-3">
            <div className="text-sm text-gray-500">
              显示第 {(page - 1) * pageSize + 1} 到 {Math.min(page * pageSize, total)} 条，共{' '}
              {total} 个数据库
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

      {/* Create Dialog */}
      {showCreateDialog && (
        <DatabaseDialog
          clusters={clusters}
          onClose={() => {
            setShowCreateDialog(false);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingDatabase && (
        <DatabaseDeleteDialog
          database={deletingDatabase}
          isPending={isPending}
          onConfirm={confirmDeleteAction}
          onCancel={() => setDeletingDatabase(null)}
        />
      )}

      {/* Config Check Dialog */}
      {checkingDatabase && (
        <DatabaseConfigCheckDialog
          databaseId={checkingDatabase.id}
          displayName={checkingDatabase.displayName}
          clusterName={checkingDatabase.clusterName}
          onClose={() => setCheckingDatabase(null)}
        />
      )}
    </div>
  );
}
