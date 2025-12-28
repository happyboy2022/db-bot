'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  createDatabase,
  getExistingTargetTypes,
  testDatabaseConfigAction,
} from '@/app/(dashboard)/admin/databases/actions';
import {
  DB_TARGET_TYPES,
  DB_TARGET_TYPE_KEYS,
  type DbTargetTypeKey,
} from '@sql-ops/shared';

interface ClusterOption {
  id: string;
  name: string;
  displayName: string;
  region: string | null;
}

interface DatabaseDialogProps {
  clusters: ClusterOption[];
  onClose: () => void;
}

interface ConfigTestResult {
  configured: boolean;
  maskedUrl?: string;
  error?: string;
}

export function DatabaseDialog({ clusters, onClose }: DatabaseDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>('');
  const [selectedTargetType, setSelectedTargetType] = useState<DbTargetTypeKey | ''>('');
  const [existingTypes, setExistingTypes] = useState<DbTargetTypeKey[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [testResult, setTestResult] = useState<ConfigTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // 当选择集群时，获取已存在的数据库类型
  useEffect(() => {
    if (!selectedClusterId) {
      setExistingTypes([]);
      setSelectedTargetType('');
      return;
    }

    setLoadingExisting(true);
    getExistingTargetTypes(selectedClusterId)
      .then((types) => {
        setExistingTypes(types);
        // 如果当前选择的类型已存在，清除选择
        setSelectedTargetType((current) =>
          types.includes(current as DbTargetTypeKey) ? '' : current
        );
      })
      .catch((err) => {
        console.error('Failed to load existing types:', err);
        setExistingTypes([]);
      })
      .finally(() => {
        setLoadingExisting(false);
      });
  }, [selectedClusterId]);

  // 当选择目标类型变化时，清除测试结果
  useEffect(() => {
    setTestResult(null);
  }, [selectedTargetType, selectedClusterId]);

  // 获取选中集群的名称
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);

  // 获取可用的目标类型（排除已存在的）
  const availableTargetTypes = DB_TARGET_TYPE_KEYS.filter(
    (key) => !existingTypes.includes(key)
  );

  // 获取当前选中的目标类型配置
  const selectedConfig = selectedTargetType ? DB_TARGET_TYPES[selectedTargetType] : null;

  const handleTestConfig = async () => {
    if (!selectedCluster || !selectedTargetType) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testDatabaseConfigAction(selectedCluster.name, selectedTargetType);
      setTestResult({
        configured: result.configured,
        maskedUrl: result.maskedUrl,
        error: result.error,
      });
    } catch (err) {
      setTestResult({
        configured: false,
        error: err instanceof Error ? err.message : '测试失败',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!selectedClusterId || !selectedTargetType) {
      setError('请选择集群和数据库类型');
      return;
    }

    const formData = new FormData();
    formData.set('clusterId', selectedClusterId);
    formData.set('targetTypeKey', selectedTargetType);

    startTransition(async () => {
      const result = await createDatabase(formData);

      if (result.success) {
        onClose();
      } else {
        setError(result.error || '发生错误');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">添加数据库</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 所属集群 */}
          <div>
            <label htmlFor="clusterId" className="block text-sm font-medium text-gray-700">
              所属集群 <span className="text-red-500">*</span>
            </label>
            <select
              id="clusterId"
              name="clusterId"
              required
              disabled={isPending}
              value={selectedClusterId}
              onChange={(e) => setSelectedClusterId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">请选择集群</option>
              {clusters.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.displayName}
                  {cluster.region ? ` (${cluster.region})` : ''}
                </option>
              ))}
            </select>
            {clusters.length === 0 && (
              <p className="mt-1 text-xs text-yellow-600">没有可用的集群，请先创建集群</p>
            )}
          </div>

          {/* 数据库目标类型 */}
          <div>
            <label htmlFor="targetTypeKey" className="block text-sm font-medium text-gray-700">
              数据库目标类型 <span className="text-red-500">*</span>
            </label>
            <select
              id="targetTypeKey"
              name="targetTypeKey"
              required
              disabled={isPending || !selectedClusterId || loadingExisting}
              value={selectedTargetType}
              onChange={(e) => setSelectedTargetType(e.target.value as DbTargetTypeKey)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">
                {loadingExisting ? '加载中...' : '请选择数据库类型'}
              </option>
              {availableTargetTypes.map((key) => {
                const config = DB_TARGET_TYPES[key];
                return (
                  <option key={key} value={key}>
                    {config.displayName}
                    {!config.supportsSql ? ' (不支持 SQL)' : ''}
                  </option>
                );
              })}
            </select>
            {selectedClusterId && availableTargetTypes.length === 0 && !loadingExisting && (
              <p className="mt-1 text-xs text-yellow-600">
                该集群已添加所有可用的数据库类型
              </p>
            )}
            {existingTypes.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                已添加: {existingTypes.map((k) => DB_TARGET_TYPES[k].displayName).join('、')}
              </p>
            )}
          </div>

          {/* 选中类型的详细信息 */}
          {selectedConfig && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-medium text-gray-900">配置信息</h3>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex">
                  <dt className="w-24 text-gray-500">类型:</dt>
                  <dd className="text-gray-900">{selectedConfig.dbType}</dd>
                </div>
                <div className="flex">
                  <dt className="w-24 text-gray-500">代号:</dt>
                  <dd>
                    <code className="rounded bg-gray-200 px-1 text-gray-900">
                      {selectedConfig.code}
                    </code>
                  </dd>
                </div>
                <div className="flex">
                  <dt className="w-24 text-gray-500">环境变量:</dt>
                  <dd>
                    <code className="rounded bg-gray-200 px-1 text-gray-900">
                      {selectedConfig.envVar}
                    </code>
                  </dd>
                </div>
                <div className="flex">
                  <dt className="w-24 text-gray-500">SQL 支持:</dt>
                  <dd className="text-gray-900">
                    {selectedConfig.supportsSql ? (
                      <span className="text-green-600">是</span>
                    ) : (
                      <span className="text-yellow-600">否</span>
                    )}
                  </dd>
                </div>
              </dl>

              {/* 测试按钮和结果 */}
              <div className="mt-3 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={handleTestConfig}
                  disabled={isTesting || !selectedCluster}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isTesting ? (
                    <>
                      <svg
                        className="-ml-0.5 mr-1.5 h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      测试中...
                    </>
                  ) : (
                    '测试配置'
                  )}
                </button>

                {testResult && (
                  <div className="mt-2">
                    {testResult.configured ? (
                      <div className="rounded-md bg-green-50 p-2">
                        <div className="flex items-center">
                          <svg
                            className="h-4 w-4 text-green-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="ml-1 text-sm text-green-700">已配置</span>
                        </div>
                        {testResult.maskedUrl && (
                          <p className="mt-1 break-all font-mono text-xs text-green-600">
                            {testResult.maskedUrl}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-md bg-yellow-50 p-2">
                        <div className="flex items-center">
                          <svg
                            className="h-4 w-4 text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="ml-1 text-sm text-yellow-700">未配置</span>
                        </div>
                        {testResult.error && (
                          <p className="mt-1 text-xs text-yellow-600">{testResult.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={
                isPending ||
                clusters.length === 0 ||
                !selectedClusterId ||
                !selectedTargetType
              }
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? '添加中...' : '添加数据库'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
