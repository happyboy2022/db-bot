'use client';

import type { AuditLog } from '@/lib/queries/audit-logs';
import {
  getActionInfo,
  getTargetTypeInfo,
  getActionBadgeClasses,
  formatPayload,
  formatDuration,
  formatDateTime,
  type FormattedPayloadItem,
} from '@/lib/audit-utils';

interface AuditLogDetailProps {
  log: AuditLog;
  onClose: () => void;
}

/**
 * 渲染单个格式化的数据项
 */
function PayloadItem({ item }: { item: FormattedPayloadItem }) {
  const renderValue = () => {
    switch (item.type) {
      case 'code':
        return (
          <pre className="mt-1 overflow-auto rounded-md bg-gray-800 p-3 text-sm text-gray-100">
            <code>{item.value}</code>
          </pre>
        );

      case 'status':
        const statusColors = {
          green: 'bg-green-100 text-green-800',
          red: 'bg-red-100 text-red-800',
          blue: 'bg-blue-100 text-blue-800',
          gray: 'bg-gray-100 text-gray-800',
        };
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${statusColors[item.color || 'gray']}`}
          >
            {item.color === 'green' && '✓ '}
            {item.color === 'red' && '✗ '}
            {String(item.value)}
          </span>
        );

      case 'number':
        return (
          <span className="font-mono text-lg font-semibold text-gray-900">
            {typeof item.value === 'number'
              ? item.value.toLocaleString('zh-CN')
              : item.value}
          </span>
        );

      case 'duration':
        return (
          <span className="font-mono text-gray-900">
            {formatDuration(Number(item.value))}
          </span>
        );

      case 'date':
        return (
          <span className="text-gray-900">
            {formatDateTime(String(item.value))}
          </span>
        );

      case 'link':
        return (
          <a
            href={String(item.value)}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.value}
          </a>
        );

      default:
        const textColors = {
          green: 'text-green-700',
          red: 'text-red-700',
          blue: 'text-blue-700',
          gray: 'text-gray-900',
        };
        return (
          <span className={textColors[item.color || 'gray']}>
            {String(item.value)}
          </span>
        );
    }
  };

  return (
    <div className="py-3">
      <dt className="text-sm font-medium text-gray-500">{item.label}</dt>
      <dd className="mt-1">{renderValue()}</dd>
    </div>
  );
}

export function AuditLogDetail({ log, onClose }: AuditLogDetailProps) {
  const actionInfo = getActionInfo(log.action);
  const targetInfo = getTargetTypeInfo(log.targetType);
  const badgeClasses = getActionBadgeClasses(actionInfo.color);
  const formattedPayload = formatPayload(log.action, log.payload);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl">
        {/* 头部 */}
        <div className="sticky top-0 border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{actionInfo.icon}</span>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  审计日志详情
                </h2>
                <p className="text-sm text-gray-500">{actionInfo.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 操作类型卡片 */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${badgeClasses.bg} ${badgeClasses.text}`}
                >
                  {actionInfo.icon} {actionInfo.label}
                </span>
                <span className="text-gray-500">→</span>
                <span className="flex items-center gap-1.5 text-gray-700">
                  <span>{targetInfo.icon}</span>
                  <span>{targetInfo.label}</span>
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
          </div>

          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                <span>👤</span>
                <span>操作者</span>
              </div>
              <div className="mt-2">
                <p className="font-medium text-gray-900">
                  {log.actor?.displayName || log.actor?.email || '系统'}
                </p>
                {log.actor?.displayName && log.actor?.email && (
                  <p className="text-sm text-gray-500">{log.actor.email}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                <span>{targetInfo.icon}</span>
                <span>操作目标</span>
              </div>
              <div className="mt-2">
                <p className="font-medium text-gray-900">{targetInfo.label}</p>
                {log.targetId && (
                  <p className="mt-1 truncate font-mono text-sm text-gray-500" title={log.targetId}>
                    ID: {log.targetId}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 详细数据 */}
          {formattedPayload.length > 0 && (
            <div className="rounded-lg border">
              <div className="border-b bg-gray-50 px-4 py-3">
                <h3 className="flex items-center gap-2 font-medium text-gray-900">
                  <span>📊</span>
                  <span>操作详情</span>
                </h3>
              </div>
              <div className="divide-y px-4">
                {formattedPayload.map((item, index) => (
                  <PayloadItem key={index} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* 原始数据（可折叠） */}
          {log.payload && Object.keys(log.payload).length > 0 && (
            <details className="rounded-lg border">
              <summary className="cursor-pointer border-b bg-gray-50 px-4 py-3 font-medium text-gray-700 hover:bg-gray-100">
                <span className="ml-2">📋 查看原始数据</span>
              </summary>
              <pre className="overflow-auto p-4 text-sm text-gray-700">
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            </details>
          )}

          {/* 来源信息 */}
          {(log.ipAddress || log.userAgent) && (
            <div className="rounded-lg border">
              <div className="border-b bg-gray-50 px-4 py-3">
                <h3 className="flex items-center gap-2 font-medium text-gray-900">
                  <span>🌐</span>
                  <span>来源信息</span>
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {log.ipAddress && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      IP 地址
                    </span>
                    <p className="mt-1 font-mono text-gray-900">{log.ipAddress}</p>
                  </div>
                )}
                {log.userAgent && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      浏览器信息
                    </span>
                    <p className="mt-1 break-all text-sm text-gray-600">
                      {log.userAgent}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="sticky bottom-0 border-t bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              日志 ID: {log.id}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
