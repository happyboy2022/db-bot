'use client';

import { useState, useTransition, useEffect } from 'react';
import type { ClusterListItem } from '@/lib/queries/clusters';
import {
  createCluster,
  updateCluster,
  checkClusterEnvConfig,
  testClusterEnvToken,
} from '@/app/(dashboard)/admin/clusters/actions';

interface ClusterDialogProps {
  cluster: ClusterListItem | null;
  onClose: () => void;
}

export function ClusterDialog({ cluster, onClose }: ClusterDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clusterName, setClusterName] = useState(cluster?.name || '');
  const [envStatus, setEnvStatus] = useState<{
    configured: boolean;
    envVarName: string;
  } | null>(cluster ? { configured: cluster.envConfigured, envVarName: cluster.envVarName } : null);
  const [isCheckingEnv, setIsCheckingEnv] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    secretCount?: number;
  } | null>(null);

  const isEditing = cluster !== null;

  // 当集群名称变化时，检查环境变量状态
  useEffect(() => {
    if (!clusterName.trim()) {
      setEnvStatus(null);
      return;
    }

    const checkEnvStatus = async () => {
      setIsCheckingEnv(true);
      try {
        const result = await checkClusterEnvConfig(clusterName);
        if (result.success && result.data) {
          setEnvStatus({
            configured: result.data.configured as boolean,
            envVarName: result.data.envVarName as string,
          });
        }
      } catch {
        // 忽略错误
      } finally {
        setIsCheckingEnv(false);
      }
    };

    // 使用防抖，避免频繁调用
    const timer = setTimeout(checkEnvStatus, 300);
    return () => clearTimeout(timer);
  }, [clusterName]);

  // 测试环境变量中的 Doppler Token
  const handleTestConnection = async () => {
    if (!clusterName.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testClusterEnvToken(clusterName);
      if (result.success && result.data) {
        setTestResult({
          success: true,
          message: `连接成功，共 ${result.data.secretCount} 个配置项`,
          secretCount: result.data.secretCount as number,
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || '测试连接失败',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: '测试连接时发生错误',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateCluster(cluster.id, formData)
        : await createCluster(formData);

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
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? '编辑集群' : '添加集群'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
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

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 集群代号 */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              集群代号 <span className="text-red-500">*</span>
            </label>
            {isEditing ? (
              <div className="mt-1">
                <code className="rounded bg-gray-100 px-2 py-1 text-sm">
                  {cluster.name}
                </code>
                <p className="mt-1 text-xs text-gray-500">
                  集群代号创建后不可修改
                </p>
              </div>
            ) : (
              <>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  disabled={isPending}
                  pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value.toLowerCase())}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="如：us-1, sg-1, dev"
                />
                <p className="mt-1 text-xs text-gray-500">
                  只能包含小写字母、数字和连字符，不能以连字符开头或结尾
                </p>
              </>
            )}
          </div>

          {/* 集群名称 */}
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700"
            >
              集群名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              defaultValue={cluster?.displayName}
              required
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="如：美国一区生产环境"
            />
          </div>

          {/* 区域 */}
          <div>
            <label
              htmlFor="region"
              className="block text-sm font-medium text-gray-700"
            >
              区域
            </label>
            <input
              id="region"
              name="region"
              type="text"
              defaultValue={cluster?.region || ''}
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="如：us-east-1"
            />
          </div>

          {/* 环境变量配置状态 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Doppler 配置
            </label>
            <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
              {isCheckingEnv ? (
                <p className="text-sm text-gray-500">检查中...</p>
              ) : envStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">环境变量：</span>
                    <code className="rounded bg-white px-2 py-0.5 text-xs font-mono border">
                      {envStatus.envVarName}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">状态：</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        envStatus.configured
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {envStatus.configured ? '已配置' : '未配置'}
                    </span>
                  </div>
                  {!envStatus.configured && (
                    <p className="text-xs text-yellow-700 mt-1">
                      请在 Console 项目的 Doppler 配置中添加此环境变量
                    </p>
                  )}
                  {envStatus.configured && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || !envStatus.configured}
                        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isTesting ? '测试中...' : '测试连接'}
                      </button>
                      {testResult && (
                        <div
                          className={`mt-2 text-xs ${
                            testResult.success
                              ? 'text-green-700'
                              : 'text-red-700'
                          }`}
                        >
                          {testResult.success ? '✓ ' : '✗ '}
                          {testResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  请输入集群代号以查看环境变量配置状态
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              系统会自动从环境变量读取 Doppler Token，无需手动填写
            </p>
          </div>

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
              disabled={isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending
                ? isEditing
                  ? '更新中...'
                  : '创建中...'
                : isEditing
                  ? '更新集群'
                  : '添加集群'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
