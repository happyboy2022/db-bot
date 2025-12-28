'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SessionTarget } from '@/lib/executor/sessions';
import type { ExecutingRequest } from '@/lib/executor/requests';
import { ExecutionList } from './execution-list';
import { TerminateDialog } from './terminate-dialog';

interface ExecutionManagerProps {
  initialTargets: SessionTarget[];
}

export function ExecutionManager({ initialTargets }: ExecutionManagerProps) {
  const [targets] = useState<SessionTarget[]>(initialTargets);
  const [selectedTarget, setSelectedTarget] = useState<SessionTarget | null>(
    initialTargets.length > 0 ? initialTargets[0] : null
  );
  const [executions, setExecutions] = useState<ExecutingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState<ExecutingRequest | null>(null);

  const fetchExecutions = useCallback(async () => {
    if (!selectedTarget) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        clusterId: selectedTarget.clusterId,
        code: selectedTarget.code,
        dbType: selectedTarget.dbType,
      });

      const response = await fetch(`/api/executions?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`请求失败: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.success) {
        setExecutions(result.requests || []);
      } else {
        setError(result.error || '获取执行中请求失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取执行中请求失败');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTarget]);

  // Fetch on mount and target change
  useEffect(() => {
    if (selectedTarget) {
      fetchExecutions();
    }
  }, [selectedTarget, fetchExecutions]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !selectedTarget) return;

    const interval = setInterval(fetchExecutions, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedTarget, fetchExecutions]);

  const handleTargetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      setSelectedTarget(null);
      setExecutions([]);
      return;
    }

    const [clusterId, dbType, code] = value.split(':');
    setSelectedTarget({ clusterId, dbType, code });
  };

  const handleTerminate = (execution: ExecutingRequest) => {
    setTerminateTarget(execution);
  };

  const handleTerminateConfirm = async (reason: string) => {
    if (!terminateTarget || !selectedTarget) return;

    try {
      const response = await fetch('/api/executions/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: selectedTarget.clusterId,
          requestId: terminateTarget.requestId,
          reason,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`请求失败: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.success) {
        setTerminateTarget(null);
        fetchExecutions();
      } else {
        setError(result.error || '终止请求失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '终止请求失败');
    }
  };

  const getTargetKey = (target: SessionTarget) =>
    `${target.clusterId}:${target.dbType}:${target.code}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4">
        {/* Target selector */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700">
            数据库目标
          </label>
          <select
            value={selectedTarget ? getTargetKey(selectedTarget) : ''}
            onChange={handleTargetChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">选择目标</option>
            {targets.map((target) => (
              <option key={getTargetKey(target)} value={getTargetKey(target)}>
                {target.clusterId} / {target.dbType} / {target.code}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchExecutions}
            disabled={!selectedTarget || isLoading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? '刷新中...' : '刷新'}
          </button>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            自动刷新（3秒）
          </label>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* No target selected */}
      {!selectedTarget && (
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-gray-500">选择数据库目标以查看执行中的请求。</p>
        </div>
      )}

      {/* Executions list */}
      {selectedTarget && (
        <ExecutionList
          executions={executions}
          isLoading={isLoading}
          onTerminate={handleTerminate}
        />
      )}

      {/* Terminate dialog */}
      {terminateTarget && (
        <TerminateDialog
          requestId={terminateTarget.requestId}
          sql={terminateTarget.sql}
          processId={terminateTarget.processId}
          onConfirm={handleTerminateConfirm}
          onCancel={() => setTerminateTarget(null)}
        />
      )}
    </div>
  );
}
