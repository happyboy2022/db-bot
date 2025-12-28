'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AuditLog } from '@/lib/queries/audit-logs';
import { AuditLogDetail } from './audit-log-detail';
import {
  getActionInfo,
  getTargetTypeInfo,
  getActionBadgeClasses,
  generateActionSummary,
  formatRelativeTime,
} from '@/lib/audit-utils';

interface AuditLogListProps {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditLogList({
  logs,
  total,
  page,
  pageSize,
  totalPages,
}: AuditLogListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/admin/audit?${params.toString()}`);
  };

  if (logs.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-gray-500">暂无审计日志记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 卡片式列表 */}
      <div className="space-y-3">
        {logs.map((log) => {
          const actionInfo = getActionInfo(log.action);
          const targetInfo = getTargetTypeInfo(log.targetType);
          const badgeClasses = getActionBadgeClasses(actionInfo.color);
          const actorName =
            log.actor?.displayName || log.actor?.email || '系统';
          const summary = generateActionSummary(
            log.action,
            log.targetType,
            log.payload,
            actorName
          );

          return (
            <div
              key={log.id}
              className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="p-4">
                {/* 头部：时间和操作类型 */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{actionInfo.icon}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${badgeClasses.bg} ${badgeClasses.text}`}
                    >
                      {actionInfo.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span title={formatDateTime(log.createdAt)}>
                      {formatRelativeTime(log.createdAt)}
                    </span>
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="rounded-md bg-gray-100 px-2.5 py-1 text-gray-700 hover:bg-gray-200"
                    >
                      查看详情
                    </button>
                  </div>
                </div>

                {/* 摘要描述 */}
                <p className="mb-3 text-gray-900">{summary}</p>

                {/* 底部信息 */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                  {/* 操作者 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">👤</span>
                    <span>{actorName}</span>
                    {log.actor?.displayName && log.actor?.email && (
                      <span className="text-gray-400">({log.actor.email})</span>
                    )}
                  </div>

                  {/* 目标类型 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">{targetInfo.icon}</span>
                    <span>{targetInfo.label}</span>
                  </div>

                  {/* 目标 ID */}
                  {log.targetId && (
                    <div
                      className="flex items-center gap-1.5"
                      title={log.targetId}
                    >
                      <span className="text-gray-400">#</span>
                      <span className="font-mono">
                        {log.targetId.substring(0, 8)}
                      </span>
                    </div>
                  )}

                  {/* 精确时间 */}
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <span>🕐</span>
                    <span>{formatDateTime(log.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between rounded-lg border bg-white px-6 py-3">
        <div className="text-sm text-gray-500">
          显示第 {(page - 1) * pageSize + 1} 到{' '}
          {Math.min(page * pageSize, total)} 条，共 {total} 条日志
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="flex items-center px-3 text-sm text-gray-600">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>

      {/* 详情模态窗口 */}
      {selectedLog && (
        <AuditLogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}
