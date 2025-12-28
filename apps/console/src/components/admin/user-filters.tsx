'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { UserFilters } from '@/lib/queries/users';

interface UserFiltersPanelProps {
  currentFilters: UserFilters;
}

export function UserFiltersPanel({ currentFilters }: UserFiltersPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState(currentFilters.search || '');

  const updateFilters = useCallback(
    (updates: Partial<UserFilters>) => {
      const params = new URLSearchParams();

      const newRole = 'role' in updates ? updates.role : currentFilters.role;
      const newStatus = 'status' in updates ? updates.status : currentFilters.status;
      const newSearch = 'search' in updates ? updates.search : currentFilters.search;

      if (newRole) params.set('role', newRole);
      if (newStatus) params.set('status', newStatus);
      if (newSearch) params.set('search', newSearch);

      // Reset to page 1 when filters change
      router.push(`/admin/users?${params.toString()}`);
    },
    [router, currentFilters]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: search.trim() || null });
  };

  const clearFilters = () => {
    setSearch('');
    router.push('/admin/users');
  };

  const hasActiveFilters =
    currentFilters.role || currentFilters.status || currentFilters.search;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1">
          <label className="block text-sm font-medium text-gray-700">
            搜索
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按邮箱或姓名搜索..."
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              搜索
            </button>
          </div>
        </form>

        {/* Role filter */}
        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700">
            角色
          </label>
          <select
            value={currentFilters.role || ''}
            onChange={(e) =>
              updateFilters({
                role: (e.target.value || null) as UserFilters['role'],
              })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部角色</option>
            <option value="PENDING">待激活</option>
            <option value="USER">普通用户</option>
            <option value="ADMIN">管理员</option>
          </select>
        </div>

        {/* Status filter */}
        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700">
            状态
          </label>
          <select
            value={currentFilters.status || ''}
            onChange={(e) =>
              updateFilters({
                status: (e.target.value || null) as UserFilters['status'],
              })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">已激活</option>
            <option value="SUSPENDED">已停用</option>
          </select>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
