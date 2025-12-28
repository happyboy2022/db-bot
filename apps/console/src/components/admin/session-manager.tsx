'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  SessionInfo,
  SessionTarget,
  SessionFilterStats,
} from '@/lib/executor/sessions';
import { SessionList } from './session-list';
import { KillDialog } from './kill-dialog';

interface SessionManagerProps {
  initialTargets: SessionTarget[];
}

export function SessionManager({ initialTargets }: SessionManagerProps) {
  const [targets] = useState<SessionTarget[]>(initialTargets);
  const [selectedTarget, setSelectedTarget] = useState<SessionTarget | null>(
    initialTargets.length > 0 ? initialTargets[0] : null
  );
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [killTarget, setKillTarget] = useState<SessionInfo | null>(null);

  // Filter options state
  const [filterByConfiguredUser, setFilterByConfiguredUser] = useState(true);
  const [excludeIdleSessions, setExcludeIdleSessions] = useState(true);

  // Filter statistics and configured user
  const [filterStats, setFilterStats] = useState<SessionFilterStats | null>(null);
  const [configuredUser, setConfiguredUser] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!selectedTarget) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        clusterId: selectedTarget.clusterId,
        code: selectedTarget.code,
        dbType: selectedTarget.dbType,
        filterByConfiguredUser: String(filterByConfiguredUser),
        excludeIdleSessions: String(excludeIdleSessions),
      });

      const response = await fetch(`/api/sessions?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`请求失败: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.success) {
        setSessions(result.sessions || []);
        setFilterStats(result.filterStats || null);
        setConfiguredUser(result.configuredUser || null);
      } else {
        setError(result.error || '获取会话失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取会话失败');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTarget, filterByConfiguredUser, excludeIdleSessions]);

  // Fetch on mount and target change
  useEffect(() => {
    if (selectedTarget) {
      fetchSessions();
    }
  }, [selectedTarget, fetchSessions]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !selectedTarget) return;

    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedTarget, fetchSessions]);

  const handleTargetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      setSelectedTarget(null);
      setSessions([]);
      return;
    }

    const [clusterId, dbType, code] = value.split(':');
    setSelectedTarget({ clusterId, dbType, code });
  };

  const handleKill = (session: SessionInfo) => {
    setKillTarget(session);
  };

  const handleKillConfirm = async (reason: string) => {
    if (!killTarget || !selectedTarget) return;

    try {
      const response = await fetch('/api/sessions/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: selectedTarget.clusterId,
          dbType: selectedTarget.dbType,
          code: selectedTarget.code,
          processId: killTarget.id,
          reason,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`请求失败: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.success) {
        setKillTarget(null);
        fetchSessions();
      } else {
        setError(result.error || '终止会话失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '终止会话失败');
    }
  };

  const getTargetKey = (target: SessionTarget) =>
    `${target.clusterId}:${target.dbType}:${target.code}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
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
              onClick={fetchSessions}
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
              自动刷新（5秒）
            </label>
          </div>
        </div>

        {/* Filter options */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-200">
          <span className="text-sm font-medium text-gray-700">过滤选项：</span>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filterByConfiguredUser}
              onChange={(e) => setFilterByConfiguredUser(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            仅显示配置用户{configuredUser && <span className="text-gray-400">({configuredUser})</span>}
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={excludeIdleSessions}
              onChange={(e) => setExcludeIdleSessions(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            隐藏空闲会话（Sleep等）
          </label>

          {/* Filter statistics */}
          {filterStats && (
            <div className="ml-auto text-xs text-gray-500">
              总计 {filterStats.totalFromDb} 条
              {filterStats.filteredByUser > 0 && (
                <span className="ml-2">
                  | 按用户过滤 {filterStats.filteredByUser} 条
                </span>
              )}
              {filterStats.filteredByIdle > 0 && (
                <span className="ml-2">
                  | 隐藏空闲 {filterStats.filteredByIdle} 条
                </span>
              )}
              <span className="ml-2 font-medium text-gray-700">
                | 当前显示 {filterStats.afterIdleFilter} 条
              </span>
            </div>
          )}
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
          <p className="text-gray-500">选择数据库目标以查看会话。</p>
        </div>
      )}

      {/* Sessions list */}
      {selectedTarget && (
        <SessionList
          sessions={sessions}
          isLoading={isLoading}
          onKill={handleKill}
        />
      )}

      {/* Kill dialog */}
      {killTarget && (
        <KillDialog
          processId={killTarget.id}
          sql={killTarget.info}
          onConfirm={handleKillConfirm}
          onCancel={() => setKillTarget(null)}
        />
      )}
    </div>
  );
}
