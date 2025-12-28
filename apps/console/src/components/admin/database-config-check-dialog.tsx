'use client';

import { useState, useEffect } from 'react';
import { checkDatabaseConfig } from '@/app/(dashboard)/admin/databases/actions';
import type { DatabaseCheckResult, CheckItemResult } from '@sql-ops/shared';

interface DatabaseConfigCheckDialogProps {
  databaseId: string;
  displayName: string;
  clusterName: string;
  onClose: () => void;
}

function StatusIcon({ status }: { status: CheckItemResult['status'] }) {
  switch (status) {
    case 'success':
      return <span className="text-green-500">✓</span>;
    case 'warning':
      return <span className="text-yellow-500">⚠</span>;
    case 'error':
      return <span className="text-red-500">✗</span>;
    case 'skipped':
      return <span className="text-gray-400">-</span>;
    default:
      return null;
  }
}

function StatusBadge({ status }: { status: CheckItemResult['status'] }) {
  const styles = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    skipped: 'bg-gray-100 text-gray-500',
  };

  const labels = {
    success: '正常',
    warning: '警告',
    error: '错误',
    skipped: '跳过',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CheckItem({ item }: { item: CheckItemResult }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <StatusIcon status={item.status} />
          <span className="font-medium text-gray-900">{item.name}</span>
          {item.required && (
            <span className="text-xs text-red-500">必需</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1 ml-5">{item.message}</p>
        {item.details && (
          <p className="text-xs text-gray-400 mt-0.5 ml-5 font-mono">{item.details}</p>
        )}
        {item.maskedUrl && (
          <p className="text-xs text-gray-400 mt-0.5 ml-5 font-mono truncate">
            {item.maskedUrl}
          </p>
        )}
        {item.latencyMs !== undefined && item.status === 'success' && (
          <p className="text-xs text-green-600 mt-0.5 ml-5">
            延迟: {item.latencyMs}ms
          </p>
        )}
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

export function DatabaseConfigCheckDialog({
  databaseId,
  displayName,
  clusterName,
  onClose,
}: DatabaseConfigCheckDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<DatabaseCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runCheck = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await checkDatabaseConfig(databaseId, 'connection');
        if (response.success && response.result) {
          setResult(response.result);
        } else {
          setError(response.error || '配置检测失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '配置检测失败');
      } finally {
        setIsLoading(false);
      }
    };

    runCheck();
  }, [databaseId]);

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await checkDatabaseConfig(databaseId, 'connection');
      if (response.success && response.result) {
        setResult(response.result);
      } else {
        setError(response.error || '配置检测失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '配置检测失败');
    } finally {
      setIsLoading(false);
    }
  };

  const getOverallStatus = (): CheckItemResult['status'] => {
    if (!result) return 'skipped';
    if (result.connectionStatus?.status === 'error') return 'error';
    if (result.configStatus.status === 'error') return 'error';
    if (result.connectionStatus?.status === 'warning' || result.configStatus.status === 'warning') return 'warning';
    return 'success';
  };

  const getOverallStatusStyle = (status: CheckItemResult['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const overallStatus = getOverallStatus();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              数据库配置检测
            </h2>
            <p className="text-sm text-gray-500">
              {displayName} @ {clusterName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] px-6 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-500">正在检测配置...</p>
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Overall Status */}
              <div className={`rounded-lg border p-4 ${getOverallStatusStyle(overallStatus)}`}>
                <div className="flex items-center gap-2">
                  <StatusIcon status={overallStatus} />
                  <span className="font-medium">
                    {overallStatus === 'success' ? '配置检测通过' :
                     overallStatus === 'warning' ? '配置检测有警告' :
                     '配置检测失败'}
                  </span>
                  {result.required && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-200 text-red-800">
                      必需配置
                    </span>
                  )}
                </div>
                {result.requiredReason && (
                  <p className="text-sm mt-2">{result.requiredReason}</p>
                )}
              </div>

              {/* Environment Variable */}
              <div className="rounded-lg border p-4">
                <h3 className="font-medium text-gray-900 mb-2">环境变量</h3>
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">{result.envVar}</code>
              </div>

              {/* Check Results */}
              <div className="rounded-lg border p-4">
                <h3 className="font-medium text-gray-900 mb-3">检测结果</h3>
                <CheckItem item={result.configStatus} />
                {result.connectionStatus && (
                  <CheckItem item={result.connectionStatus} />
                )}
              </div>

              {/* Troubleshooting Tips */}
              {(result.configStatus.status === 'error' || result.connectionStatus?.status === 'error') && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <h3 className="font-medium text-yellow-800 mb-2">排查建议</h3>
                  <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                    {result.configStatus.status === 'error' && (
                      <li>请检查 Executor 的 Doppler 配置中是否已设置 {result.envVar}</li>
                    )}
                    {result.connectionStatus?.status === 'error' && (
                      <>
                        <li>请检查数据库连接字符串是否正确</li>
                        <li>请确认数据库服务是否正常运行</li>
                        <li>请检查网络连接和防火墙设置</li>
                      </>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? '检测中...' : '重新检测'}
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
