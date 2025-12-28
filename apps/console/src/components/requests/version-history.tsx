'use client';

import { useState } from 'react';
import type { RequestDetailVersion } from '@/lib/queries/request-detail';

interface VersionHistoryProps {
  versions: RequestDetailVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  onCompareVersions?: (leftVersionId: string, rightVersionId: string) => void;
}

export function VersionHistory({
  versions,
  selectedVersionId,
  onSelectVersion,
  onCompareVersions,
}: VersionHistoryProps) {
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const handleVersionClick = (versionId: string) => {
    if (compareMode) {
      setCompareSelection((prev) => {
        if (prev.includes(versionId)) {
          return prev.filter((id) => id !== versionId);
        }
        if (prev.length >= 2) {
          return [prev[1], versionId];
        }
        return [...prev, versionId];
      });
    } else {
      onSelectVersion(versionId);
    }
  };

  const handleCompare = () => {
    if (compareSelection.length === 2 && onCompareVersions) {
      // Sort by version number (older first)
      const sorted = [...compareSelection].sort((a, b) => {
        const versionA = versions.find((v) => v.id === a)?.version ?? 0;
        const versionB = versions.find((v) => v.id === b)?.version ?? 0;
        return versionA - versionB;
      });
      onCompareVersions(sorted[0], sorted[1]);
      setCompareMode(false);
      setCompareSelection([]);
    }
  };

  const toggleCompareMode = () => {
    if (compareMode) {
      setCompareMode(false);
      setCompareSelection([]);
    } else {
      setCompareMode(true);
      setCompareSelection([]);
    }
  };

  if (versions.length === 0) {
    return null;
  }

  const canCompare = versions.length >= 2;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">版本历史</h3>
          {canCompare && onCompareVersions && (
            <button
              onClick={toggleCompareMode}
              className={`text-xs font-medium ${
                compareMode
                  ? 'text-blue-600 hover:text-blue-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {compareMode ? '取消' : '比较'}
            </button>
          )}
        </div>
        {compareMode && (
          <p className="mt-1 text-xs text-gray-500">
            选择 2 个版本进行比较
          </p>
        )}
      </div>

      {/* Compare button */}
      {compareMode && compareSelection.length === 2 && (
        <div className="border-b border-gray-200 bg-blue-50 px-4 py-2">
          <button
            onClick={handleCompare}
            className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            比较选中的版本
          </button>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {versions.map((version) => {
          const isSelected = compareMode
            ? compareSelection.includes(version.id)
            : version.id === selectedVersionId;

          return (
            <button
              key={version.id}
              onClick={() => handleVersionClick(version.id)}
              className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                isSelected ? (compareMode ? 'bg-purple-50' : 'bg-blue-50') : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {compareMode && (
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-purple-600 bg-purple-600 text-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  )}
                  <span className="font-medium text-gray-900">v{version.version}</span>
                  {version.isCurrentVersion && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      当前
                    </span>
                  )}
                  {version.isApprovedVersion && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      已批准
                    </span>
                  )}
                </div>
                {!compareMode && isSelected && (
                  <svg
                    className="h-4 w-4 text-blue-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {formatDate(version.createdAt)} 由{' '}
                {version.createdByDisplayName || version.createdByEmail}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {version.statements.length} 条语句
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
