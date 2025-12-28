'use client';

import { useState } from 'react';
import type { ClusterOption, DbTargetOption } from '@/lib/queries/targets';

interface MultiTargetSelectorProps {
  clusters: Array<ClusterOption & { targets: DbTargetOption[] }>;
  value: string[];
  onChange: (targetIds: string[], targets: DbTargetOption[]) => void;
  disabled?: boolean;
  maxTargets?: number;
}

export function MultiTargetSelector({
  clusters,
  value,
  onChange,
  disabled = false,
  maxTargets,
}: MultiTargetSelectorProps) {
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(() => {
    // Auto-expand clusters that have selected targets
    const expanded = new Set<string>();
    for (const cluster of clusters) {
      if (cluster.targets.some((t) => value.includes(t.id))) {
        expanded.add(cluster.id);
      }
    }
    return expanded;
  });

  // Get all selected targets info
  const getSelectedTargets = (): DbTargetOption[] => {
    const targets: DbTargetOption[] = [];
    for (const cluster of clusters) {
      for (const target of cluster.targets) {
        if (value.includes(target.id)) {
          targets.push(target);
        }
      }
    }
    return targets;
  };

  const toggleCluster = (clusterId: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  const handleTargetToggle = (targetId: string) => {
    const isSelected = value.includes(targetId);
    let newValue: string[];

    if (isSelected) {
      newValue = value.filter((id) => id !== targetId);
    } else {
      if (maxTargets && value.length >= maxTargets) {
        return; // Don't add more if at limit
      }
      newValue = [...value, targetId];
    }

    // Get all selected targets
    const targets: DbTargetOption[] = [];
    for (const cluster of clusters) {
      for (const target of cluster.targets) {
        if (newValue.includes(target.id)) {
          targets.push(target);
        }
      }
    }

    onChange(newValue, targets);
  };

  const handleRemoveTarget = (targetId: string) => {
    const newValue = value.filter((id) => id !== targetId);
    const targets: DbTargetOption[] = [];
    for (const cluster of clusters) {
      for (const target of cluster.targets) {
        if (newValue.includes(target.id)) {
          targets.push(target);
        }
      }
    }
    onChange(newValue, targets);
  };

  const selectedTargets = getSelectedTargets();

  // Find cluster info for a target
  const getClusterForTarget = (targetId: string): ClusterOption | undefined => {
    for (const cluster of clusters) {
      if (cluster.targets.some((t) => t.id === targetId)) {
        return cluster;
      }
    }
    return undefined;
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        目标数据库
        {maxTargets && (
          <span className="ml-1 text-gray-400">（最多 {maxTargets} 个）</span>
        )}
      </label>

      {/* Cluster list with checkboxes */}
      <div className="rounded-md border border-gray-300 bg-white">
        {clusters.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            暂无可用的集群
          </div>
        ) : (
          clusters.map((cluster) => {
            const isExpanded = expandedClusters.has(cluster.id);
            const selectedInCluster = cluster.targets.filter((t) =>
              value.includes(t.id)
            ).length;

            return (
              <div
                key={cluster.id}
                className="border-b border-gray-200 last:border-b-0"
              >
                {/* Cluster header */}
                <button
                  type="button"
                  onClick={() => toggleCluster(cluster.id)}
                  disabled={disabled}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span className="font-medium text-gray-900">
                      {cluster.displayName}
                    </span>
                    {cluster.region && (
                      <span className="text-sm text-gray-500">
                        ({cluster.region})
                      </span>
                    )}
                  </div>
                  {selectedInCluster > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      已选 {selectedInCluster}
                    </span>
                  )}
                </button>

                {/* Target list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    {cluster.targets.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">
                        该集群暂无可用的数据库目标
                      </div>
                    ) : (
                      cluster.targets.map((target) => {
                        const isSelected = value.includes(target.id);
                        const isDisabled =
                          disabled ||
                          (!isSelected &&
                            maxTargets !== undefined &&
                            value.length >= maxTargets);

                        return (
                          <label
                            key={target.id}
                            className={`flex cursor-pointer items-center gap-3 px-4 py-2 pl-10 hover:bg-gray-100 ${
                              isDisabled ? 'cursor-not-allowed opacity-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleTargetToggle(target.id)}
                              disabled={isDisabled}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-gray-900">
                                {target.displayName}
                              </span>
                              <span className="ml-2 text-xs text-gray-500">
                                ({target.dbType} / {target.code})
                              </span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Selected targets summary */}
      {selectedTargets.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            已选择 {selectedTargets.length} 个目标：
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTargets.map((target) => {
              const cluster = getClusterForTarget(target.id);
              return (
                <span
                  key={target.id}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
                >
                  <span>
                    {cluster?.displayName} / {target.displayName}
                  </span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTarget(target.id)}
                      className="ml-1 rounded-full p-0.5 hover:bg-blue-100"
                    >
                      <svg
                        className="h-3 w-3"
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
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation message */}
      {value.length === 0 && (
        <p className="text-sm text-gray-500">请至少选择一个目标数据库</p>
      )}
    </div>
  );
}
