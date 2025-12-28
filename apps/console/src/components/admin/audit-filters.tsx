'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AuditFilters } from '@/lib/queries/audit-logs';
import { getActionInfo, getTargetTypeInfo } from '@/lib/audit-utils';

interface AuditFiltersPanelProps {
  currentFilters: AuditFilters;
  actions: string[];
  targetTypes: string[];
  users: Array<{ id: string; email: string; displayName: string | null }>;
}

export function AuditFiltersPanel({
  currentFilters,
  actions,
  targetTypes,
  users,
}: AuditFiltersPanelProps) {
  const router = useRouter();

  const updateFilters = useCallback(
    (updates: Partial<AuditFilters>) => {
      const params = new URLSearchParams();

      const newAction =
        'action' in updates ? updates.action : currentFilters.action;
      const newActorUserId =
        'actorUserId' in updates
          ? updates.actorUserId
          : currentFilters.actorUserId;
      const newTargetType =
        'targetType' in updates
          ? updates.targetType
          : currentFilters.targetType;
      const newStartDate =
        'startDate' in updates ? updates.startDate : currentFilters.startDate;
      const newEndDate =
        'endDate' in updates ? updates.endDate : currentFilters.endDate;

      if (newAction) params.set('action', newAction);
      if (newActorUserId) params.set('actorUserId', newActorUserId);
      if (newTargetType) params.set('targetType', newTargetType);
      if (newStartDate)
        params.set('startDate', newStartDate.toISOString().split('T')[0]);
      if (newEndDate)
        params.set('endDate', newEndDate.toISOString().split('T')[0]);

      router.push(`/admin/audit?${params.toString()}`);
    },
    [router, currentFilters]
  );

  const clearFilters = () => {
    router.push('/admin/audit');
  };

  const hasActiveFilters =
    currentFilters.action ||
    currentFilters.actorUserId ||
    currentFilters.targetType ||
    currentFilters.startDate ||
    currentFilters.endDate;

  // 按类别分组操作类型
  const groupedActions = groupActionsByCategory(actions);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* 操作类型筛选 */}
        <div className="w-56">
          <label className="block text-sm font-medium text-gray-700">
            操作类型
          </label>
          <select
            value={currentFilters.action || ''}
            onChange={(e) =>
              updateFilters({ action: e.target.value || null })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部操作</option>
            {Object.entries(groupedActions).map(([category, categoryActions]) => (
              <optgroup key={category} label={category}>
                {categoryActions.map((action) => {
                  const info = getActionInfo(action);
                  return (
                    <option key={action} value={action}>
                      {info.icon} {info.label}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 操作者筛选 */}
        <div className="w-48">
          <label className="block text-sm font-medium text-gray-700">
            操作者
          </label>
          <select
            value={currentFilters.actorUserId || ''}
            onChange={(e) =>
              updateFilters({ actorUserId: e.target.value || null })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部用户</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName || user.email}
              </option>
            ))}
          </select>
        </div>

        {/* 目标类型筛选 */}
        <div className="w-44">
          <label className="block text-sm font-medium text-gray-700">
            目标类型
          </label>
          <select
            value={currentFilters.targetType || ''}
            onChange={(e) =>
              updateFilters({ targetType: e.target.value || null })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部类型</option>
            {targetTypes.map((type) => {
              const info = getTargetTypeInfo(type);
              return (
                <option key={type} value={type}>
                  {info.icon} {info.label}
                </option>
              );
            })}
          </select>
        </div>

        {/* 日期范围 */}
        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700">
            开始日期
          </label>
          <input
            type="date"
            value={
              currentFilters.startDate
                ? currentFilters.startDate.toISOString().split('T')[0]
                : ''
            }
            onChange={(e) =>
              updateFilters({
                startDate: e.target.value ? new Date(e.target.value) : null,
              })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700">
            结束日期
          </label>
          <input
            type="date"
            value={
              currentFilters.endDate
                ? currentFilters.endDate.toISOString().split('T')[0]
                : ''
            }
            onChange={(e) =>
              updateFilters({
                endDate: e.target.value ? new Date(e.target.value) : null,
              })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 清除筛选 */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>✕</span>
            <span>清除筛选</span>
          </button>
        )}
      </div>

      {/* 当前筛选标签 */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {currentFilters.action && (
            <FilterTag
              label={`操作: ${getActionInfo(currentFilters.action).label}`}
              onRemove={() => updateFilters({ action: null })}
            />
          )}
          {currentFilters.actorUserId && (
            <FilterTag
              label={`操作者: ${users.find((u) => u.id === currentFilters.actorUserId)?.displayName || users.find((u) => u.id === currentFilters.actorUserId)?.email || '未知'}`}
              onRemove={() => updateFilters({ actorUserId: null })}
            />
          )}
          {currentFilters.targetType && (
            <FilterTag
              label={`目标: ${getTargetTypeInfo(currentFilters.targetType).label}`}
              onRemove={() => updateFilters({ targetType: null })}
            />
          )}
          {currentFilters.startDate && (
            <FilterTag
              label={`从: ${currentFilters.startDate.toLocaleDateString('zh-CN')}`}
              onRemove={() => updateFilters({ startDate: null })}
            />
          )}
          {currentFilters.endDate && (
            <FilterTag
              label={`至: ${currentFilters.endDate.toLocaleDateString('zh-CN')}`}
              onRemove={() => updateFilters({ endDate: null })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 筛选标签组件
 */
function FilterTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">
      {label}
      <button
        onClick={onRemove}
        className="ml-1 rounded-full p-0.5 hover:bg-blue-200"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

/**
 * 按类别分组操作类型
 */
function groupActionsByCategory(actions: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    '用户管理': [],
    'SQL 请求': [],
    '审批操作': [],
    'SQL 执行': [],
    '会话管理': [],
    '模板管理': [],
    '数据库管理': [],
    '集群管理': [],
    '其他': [],
  };

  for (const action of actions) {
    if (action.startsWith('user.')) {
      categories['用户管理'].push(action);
    } else if (action.startsWith('request.')) {
      categories['SQL 请求'].push(action);
    } else if (
      action === 'APPROVE_REQUEST' ||
      action === 'REJECT_REQUEST' ||
      action === 'REQUEST_CHANGES' ||
      action === 'approval.expire'
    ) {
      categories['审批操作'].push(action);
    } else if (action.startsWith('statement.') || action === 'RETRY_EXECUTION') {
      categories['SQL 执行'].push(action);
    } else if (action.startsWith('session.')) {
      categories['会话管理'].push(action);
    } else if (action.startsWith('template.')) {
      categories['模板管理'].push(action);
    } else if (action.startsWith('database.')) {
      categories['数据库管理'].push(action);
    } else if (action.startsWith('cluster.')) {
      categories['集群管理'].push(action);
    } else {
      categories['其他'].push(action);
    }
  }

  // 过滤掉空的分类
  const result: Record<string, string[]> = {};
  for (const [category, categoryActions] of Object.entries(categories)) {
    if (categoryActions.length > 0) {
      result[category] = categoryActions;
    }
  }

  return result;
}
