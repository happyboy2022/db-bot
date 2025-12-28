'use client';

import { useState } from 'react';
import type { ClusterOption, DbTargetOption } from '@/lib/queries/targets';

interface TargetSelectorProps {
  clusters: Array<ClusterOption & { targets: DbTargetOption[] }>;
  value: string | null;
  onChange: (targetId: string | null, target: DbTargetOption | null) => void;
  disabled?: boolean;
}

function findClusterForTarget(
  clusters: Array<ClusterOption & { targets: DbTargetOption[] }>,
  targetId: string | null
): { clusterId: string; targetId: string } {
  if (targetId) {
    for (const cluster of clusters) {
      const target = cluster.targets.find((t) => t.id === targetId);
      if (target) {
        return { clusterId: cluster.id, targetId };
      }
    }
  }
  return { clusterId: '', targetId: '' };
}

export function TargetSelector({
  clusters,
  value,
  onChange,
  disabled = false,
}: TargetSelectorProps) {
  const initialState = findClusterForTarget(clusters, value);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(initialState.clusterId);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(initialState.targetId);

  // Sync internal state with external value changes
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    const newState = findClusterForTarget(clusters, value);
    setPrevValue(value);
    setSelectedClusterId(newState.clusterId);
    setSelectedTargetId(newState.targetId);
  }

  // Find selected target from clusters
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);
  const availableTargets = selectedCluster?.targets ?? [];

  const handleClusterChange = (clusterId: string) => {
    setSelectedClusterId(clusterId);
    setSelectedTargetId('');
    onChange(null, null);
  };

  const handleTargetChange = (targetId: string) => {
    setSelectedTargetId(targetId);
    const target = availableTargets.find((t) => t.id === targetId) ?? null;
    onChange(targetId || null, target);
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="cluster"
          className="block text-sm font-medium text-gray-700"
        >
          集群
        </label>
        <select
          id="cluster"
          value={selectedClusterId}
          onChange={(e) => handleClusterChange(e.target.value)}
          disabled={disabled}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          <option value="">选择集群...</option>
          {clusters.map((cluster) => (
            <option key={cluster.id} value={cluster.id}>
              {cluster.displayName}
              {cluster.region ? ` (${cluster.region})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="target"
          className="block text-sm font-medium text-gray-700"
        >
          数据库目标
        </label>
        <select
          id="target"
          value={selectedTargetId}
          onChange={(e) => handleTargetChange(e.target.value)}
          disabled={disabled || !selectedClusterId}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          <option value="">选择目标...</option>
          {availableTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.displayName} ({target.dbType} / {target.code})
            </option>
          ))}
        </select>
        {selectedClusterId && availableTargets.length === 0 && (
          <p className="mt-1 text-sm text-gray-500">
            该集群暂无可用的数据库目标。
          </p>
        )}
      </div>
    </div>
  );
}
