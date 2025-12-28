'use client';

import { useMemo, useState } from 'react';
import type { RequestDetailVersion } from '@/lib/queries/request-detail';

interface VersionDiffProps {
  leftVersion: RequestDetailVersion;
  rightVersion: RequestDetailVersion;
  onClose: () => void;
}

type DiffLineType = 'unchanged' | 'added' | 'removed' | 'modified';

interface DiffLine {
  type: DiffLineType;
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  leftContent: string;
  rightContent: string;
}

/**
 * Simple line-by-line diff algorithm using LCS (Longest Common Subsequence)
 */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const temp: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({
        type: 'unchanged',
        leftLineNumber: i,
        rightLineNumber: j,
        leftContent: oldLines[i - 1],
        rightContent: newLines[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({
        type: 'added',
        leftLineNumber: null,
        rightLineNumber: j,
        leftContent: '',
        rightContent: newLines[j - 1],
      });
      j--;
    } else {
      temp.push({
        type: 'removed',
        leftLineNumber: i,
        rightLineNumber: null,
        leftContent: oldLines[i - 1],
        rightContent: '',
      });
      i--;
    }
  }

  // Reverse to get correct order
  for (let k = temp.length - 1; k >= 0; k--) {
    result.push(temp[k]);
  }

  return result;
}

type ViewMode = 'split' | 'unified';

export function VersionDiff({ leftVersion, rightVersion, onClose }: VersionDiffProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const diffLines = useMemo(() => {
    return computeDiff(leftVersion.sqlRaw, rightVersion.sqlRaw);
  }, [leftVersion.sqlRaw, rightVersion.sqlRaw]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const line of diffLines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
      else unchanged++;
    }

    return { added, removed, unchanged };
  }, [diffLines]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              版本对比
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              对比 v{leftVersion.version} 与 v{rightVersion.version}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                +{stats.added}
              </span>
              <span className="flex items-center gap-1 text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                -{stats.removed}
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                {stats.unchanged}
              </span>
            </div>

            {/* View mode toggle */}
            <div className="flex rounded-md border border-gray-300">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'split'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                分栏
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'unified'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                统一
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

        {/* Version headers */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-2 border-b bg-gray-50">
            <div className="border-r px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">v{leftVersion.version}</span>
                <span className="text-sm text-gray-500">
                  {formatDate(leftVersion.createdAt)}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                由 {leftVersion.createdByDisplayName || leftVersion.createdByEmail}
              </div>
            </div>
            <div className="px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">v{rightVersion.version}</span>
                <span className="text-sm text-gray-500">
                  {formatDate(rightVersion.createdAt)}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                由 {rightVersion.createdByDisplayName || rightVersion.createdByEmail}
              </div>
            </div>
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 overflow-auto font-mono text-sm">
          {viewMode === 'split' ? (
            <SplitView diffLines={diffLines} />
          ) : (
            <UnifiedView diffLines={diffLines} leftVersion={leftVersion} rightVersion={rightVersion} />
          )}
        </div>
      </div>
    </div>
  );
}

function SplitView({ diffLines }: { diffLines: DiffLine[] }) {
  return (
    <div className="grid grid-cols-2">
      {/* Left side */}
      <div className="border-r">
        {diffLines.map((line, index) => (
          <div
            key={`left-${index}`}
            className={`flex ${
              line.type === 'removed'
                ? 'bg-red-50'
                : line.type === 'added'
                  ? 'bg-gray-50'
                  : ''
            }`}
          >
            <div className="w-12 flex-shrink-0 select-none border-r bg-gray-50 px-2 py-0.5 text-right text-gray-400">
              {line.leftLineNumber || ''}
            </div>
            <div className="flex-1 whitespace-pre-wrap break-all px-3 py-0.5">
              {line.type === 'removed' && (
                <span className="mr-1 text-red-600">-</span>
              )}
              <span className={line.type === 'removed' ? 'text-red-800' : ''}>
                {line.leftContent}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Right side */}
      <div>
        {diffLines.map((line, index) => (
          <div
            key={`right-${index}`}
            className={`flex ${
              line.type === 'added'
                ? 'bg-green-50'
                : line.type === 'removed'
                  ? 'bg-gray-50'
                  : ''
            }`}
          >
            <div className="w-12 flex-shrink-0 select-none border-r bg-gray-50 px-2 py-0.5 text-right text-gray-400">
              {line.rightLineNumber || ''}
            </div>
            <div className="flex-1 whitespace-pre-wrap break-all px-3 py-0.5">
              {line.type === 'added' && (
                <span className="mr-1 text-green-600">+</span>
              )}
              <span className={line.type === 'added' ? 'text-green-800' : ''}>
                {line.rightContent}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnifiedView({
  diffLines,
  leftVersion,
  rightVersion,
}: {
  diffLines: DiffLine[];
  leftVersion: RequestDetailVersion;
  rightVersion: RequestDetailVersion;
}) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <div>
      {/* Unified header */}
      <div className="border-b bg-gray-50 px-4 py-2 text-sm text-gray-600">
        <div>--- v{leftVersion.version} ({formatDate(leftVersion.createdAt)})</div>
        <div>+++ v{rightVersion.version} ({formatDate(rightVersion.createdAt)})</div>
      </div>

      {/* Unified content */}
      {diffLines.map((line, index) => {
        const bgColor =
          line.type === 'added'
            ? 'bg-green-50'
            : line.type === 'removed'
              ? 'bg-red-50'
              : '';

        const textColor =
          line.type === 'added'
            ? 'text-green-800'
            : line.type === 'removed'
              ? 'text-red-800'
              : '';

        const prefix =
          line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

        const content = line.type === 'added' ? line.rightContent : line.leftContent;

        return (
          <div key={index} className={`flex ${bgColor}`}>
            <div className="w-12 flex-shrink-0 select-none border-r bg-gray-50 px-2 py-0.5 text-right text-gray-400">
              {line.leftLineNumber || ''}
            </div>
            <div className="w-12 flex-shrink-0 select-none border-r bg-gray-50 px-2 py-0.5 text-right text-gray-400">
              {line.rightLineNumber || ''}
            </div>
            <div className="w-6 flex-shrink-0 select-none px-1 py-0.5 text-center">
              <span className={textColor}>{prefix}</span>
            </div>
            <div className={`flex-1 whitespace-pre-wrap break-all px-2 py-0.5 ${textColor}`}>
              {content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
