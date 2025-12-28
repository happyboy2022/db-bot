'use client';

import type { ExecutingRequest } from '@/lib/executor/requests';

interface ExecutionListProps {
  executions: ExecutingRequest[];
  isLoading: boolean;
  onTerminate: (execution: ExecutingRequest) => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ExecutionList({
  executions,
  isLoading,
  onTerminate,
}: ExecutionListProps) {
  if (isLoading && executions.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <div className="animate-spin mx-auto h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        <p className="mt-2 text-gray-500">加载中...</p>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="mt-2 text-gray-500">当前没有执行中的请求</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            执行中的请求 ({executions.length})
          </h3>
          {isLoading && (
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          )}
        </div>
      </div>

      <div className="divide-y">
        {executions.map((execution) => (
          <div
            key={execution.requestId}
            className="p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {/* Request ID and Process ID */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-gray-900">
                    {execution.requestId.slice(0, 8)}...
                  </span>
                  {execution.processId && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      PID: {execution.processId}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                    执行中
                  </span>
                </div>

                {/* SQL preview */}
                <div className="mt-1">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all font-mono bg-gray-50 rounded p-2 max-h-24 overflow-y-auto">
                    {execution.sql}
                  </pre>
                </div>

                {/* Metadata */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span>
                    开始时间: {formatTimestamp(execution.startedAt)}
                  </span>
                  <span className="text-yellow-600 font-medium">
                    已运行: {formatDuration(execution.elapsedMs)}
                  </span>
                  <span>
                    超时: {formatDuration(execution.timeoutMs)}
                  </span>
                  <span>
                    Statement: {execution.statementId.slice(0, 8)}...
                  </span>
                </div>
              </div>

              {/* Terminate button */}
              <button
                onClick={() => onTerminate(execution)}
                className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
              >
                终止
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
