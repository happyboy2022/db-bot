'use client';

import { useState, useEffect } from 'react';
import { checkClusterConfig } from '@/app/(dashboard)/admin/clusters/actions';
import type {
  ClusterConfigCheckResult,
  CheckItemResult,
  DatabaseCheckResult,
} from '@sql-ops/shared';

interface ClusterConfigCheckDialogProps {
  clusterName: string;
  clusterDisplayName: string;
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
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <StatusIcon status={item.status} />
          <span className="font-medium text-gray-900">{item.name}</span>
          {item.required && (
            <span className="text-xs text-red-500">必需</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5 ml-5">{item.message}</p>
        {item.details && (
          <p className="text-xs text-gray-400 mt-0.5 ml-5 font-mono">{item.details}</p>
        )}
        {item.maskedUrl && (
          <p className="text-xs text-gray-400 mt-0.5 ml-5 font-mono truncate max-w-md">
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

function DatabaseCheckSection({ db }: { db: DatabaseCheckResult }) {
  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-gray-900">{db.displayName}</div>
        <div className="flex items-center gap-2">
          {db.required && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">必需</span>
          )}
          <StatusBadge status={db.configStatus.status} />
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-2 font-mono">{db.envVar}</div>
      <div className="space-y-1">
        <CheckItem item={db.configStatus} />
        {db.connectionStatus && <CheckItem item={db.connectionStatus} />}
      </div>
      {db.requiredReason && db.configStatus.status === 'error' && (
        <p className="text-xs text-red-600 mt-2">原因: {db.requiredReason}</p>
      )}
    </div>
  );
}

export function ClusterConfigCheckDialog({
  clusterName,
  clusterDisplayName,
  onClose,
}: ClusterConfigCheckDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<ClusterConfigCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runCheck = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await checkClusterConfig(clusterName, clusterDisplayName, 'connection', false);
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
  }, [clusterName, clusterDisplayName]);

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await checkClusterConfig(clusterName, clusterDisplayName, 'connection', true);
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

  const getOverallStatusStyle = (status: string) => {
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

  const getEnvironmentLabel = (env: string) => {
    switch (env) {
      case 'dev':
        return '开发环境';
      case 'pre':
        return '预发布环境';
      case 'prod':
        return '生产环境';
      default:
        return env;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              集群配置检测
            </h2>
            <p className="text-sm text-gray-500">
              {clusterDisplayName} ({clusterName})
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
            <div className="space-y-6">
              {/* Overall Status */}
              <div className={`rounded-lg border p-4 ${getOverallStatusStyle(result.overallStatus)}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {result.overallStatus === 'success' ? '✓ 配置检测通过' :
                         result.overallStatus === 'warning' ? '⚠ 配置检测有警告' :
                         '✗ 配置检测失败'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-white/50">
                        {getEnvironmentLabel(result.environment)}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{result.overallMessage}</p>
                  </div>
                  <div className="text-right text-sm">
                    <div>耗时: {result.durationMs}ms</div>
                    <div className="text-xs opacity-75">
                      {result.summary.success}/{result.summary.total} 项通过
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.summary.success}</div>
                  <div className="text-xs text-green-700">成功</div>
                </div>
                <div className="rounded-lg bg-yellow-50 p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{result.summary.warning}</div>
                  <div className="text-xs text-yellow-700">警告</div>
                </div>
                <div className="rounded-lg bg-red-50 p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{result.summary.error}</div>
                  <div className="text-xs text-red-700">错误</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <div className="text-2xl font-bold text-gray-600">{result.summary.skipped}</div>
                  <div className="text-xs text-gray-700">跳过</div>
                </div>
              </div>

              {/* Missing Required */}
              {result.summary.missingRequired.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h3 className="font-medium text-red-800 mb-2">缺失的必需配置</h3>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {result.summary.missingRequired.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Doppler Token Section */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Doppler Token</h3>
                <div className="border rounded-lg p-3">
                  <CheckItem item={result.dopplerToken.clusterTokenStatus} />
                  {result.dopplerToken.targetDbTokenStatus && (
                    <CheckItem item={result.dopplerToken.targetDbTokenStatus} />
                  )}
                </div>
              </div>

              {/* Executor Section */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Executor 服务</h3>
                <div className="border rounded-lg p-3">
                  <CheckItem item={result.executor.urlStatus} />
                  <CheckItem item={result.executor.signingSecretStatus} />
                  {result.executor.healthStatus && (
                    <CheckItem item={result.executor.healthStatus} />
                  )}
                </div>
              </div>

              {/* Databases Section */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">
                  数据库配置 ({result.databases.length} 个)
                </h3>
                <div className="space-y-3">
                  {result.databases.map((db) => (
                    <DatabaseCheckSection key={db.targetTypeKey} db={db} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="text-xs text-gray-400">
            {result && `检测时间: ${new Date(result.timestamp).toLocaleString('zh-CN')}`}
          </div>
          <div className="flex gap-3">
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
    </div>
  );
}
