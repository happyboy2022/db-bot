'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { RequestStatus } from '@/lib/queries/requests';

interface ClusterOption {
  id: string;
  name: string;
  displayName: string;
  region: string | null;
}

interface RequestFiltersProps {
  clusters: ClusterOption[];
  isAdmin?: boolean;
  pendingCount?: number;
}

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: 'PENDING_APPROVAL', label: '待审批' },
  { value: 'CHANGES_REQUESTED', label: '需修改' },
  { value: 'APPROVED', label: '已批准' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'APPROVAL_EXPIRED', label: '已过期' },
  { value: 'EXECUTING', label: '执行中' },
  { value: 'SUCCEEDED', label: '执行成功' },
  { value: 'FAILED', label: '执行失败' },
  { value: 'TERMINATED', label: '已终止' },
];

// 管理员快速筛选选项
const QUICK_FILTERS: { value: string; label: string; adminOnly?: boolean }[] = [
  { value: '', label: '全部' },
  { value: 'PENDING_APPROVAL', label: '待审批', adminOnly: true },
  { value: 'APPROVED', label: '已批准' },
  { value: 'FAILED', label: '执行失败' },
  { value: 'SUCCEEDED', label: '执行成功' },
];

export function RequestFilters({ clusters, isAdmin = false, pendingCount }: RequestFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') || '';
  const currentCluster = searchParams.get('clusterId') || '';
  const currentWriteFilter = searchParams.get('hasWrites') || '';

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Reset to page 1 when filters change
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const hasFilters = currentStatus || currentCluster || currentWriteFilter;

  // 判断当前选中的快速筛选
  const activeQuickFilter = QUICK_FILTERS.find(f => f.value === currentStatus)?.value ?? null;

  const handleQuickFilter = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  // 过滤掉仅管理员可见的快速筛选选项
  const visibleQuickFilters = QUICK_FILTERS.filter(f => !f.adminOnly || isAdmin);

  return (
    <div className="mb-6 space-y-4">
      {/* 快速筛选标签 */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {visibleQuickFilters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => handleQuickFilter(filter.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
              activeQuickFilter === filter.value || (filter.value === '' && !currentStatus)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {filter.label}
            {filter.value === 'PENDING_APPROVAL' && pendingCount !== undefined && pendingCount > 0 && (
              <span className={cn(
                'inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-xs font-bold',
                activeQuickFilter === 'PENDING_APPROVAL'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 text-amber-800'
              )}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 详细筛选 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Status Filter */}
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
            状态
          </label>
          <select
            id="status-filter"
            value={currentStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cluster Filter */}
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="cluster-filter" className="block text-sm font-medium text-gray-700 mb-1">
            集群
          </label>
          <select
            id="cluster-filter"
            value={currentCluster}
            onChange={(e) => updateFilter('clusterId', e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部集群</option>
            {clusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.displayName}{cluster.region ? ` (${cluster.region})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Write Operations Filter */}
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="write-filter" className="block text-sm font-medium text-gray-700 mb-1">
            类型
          </label>
          <select
            id="write-filter"
            value={currentWriteFilter}
            onChange={(e) => updateFilter('hasWrites', e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部类型</option>
            <option value="true">包含写操作</option>
            <option value="false">仅查询</option>
          </select>
        </div>

        {/* Clear Filters Button */}
        {hasFilters && (
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              清除筛选
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
