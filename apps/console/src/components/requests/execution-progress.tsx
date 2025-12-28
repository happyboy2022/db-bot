'use client';

/**
 * Execution progress component
 * Shows real-time progress of SQL statement execution
 */

export type StatementProgressStatus =
  | 'pending'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export interface StatementProgress {
  id: string;
  orderIndex: number;
  sqlText: string;
  status: StatementProgressStatus;
  affectedRows?: number | null;
  resultRowCount?: number | null;
  durationMs?: number;
  error?: string;
}

interface ExecutionProgressProps {
  statements: StatementProgress[];
  currentIndex: number;
  isComplete: boolean;
}

export function ExecutionProgress({
  statements,
  isComplete,
}: ExecutionProgressProps) {
  const completedCount = statements.filter(
    (s) => s.status === 'succeeded' || s.status === 'failed' || s.status === 'skipped'
  ).length;
  const progress = statements.length > 0 ? (completedCount / statements.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {isComplete ? '执行完成' : '执行中...'}
          </span>
          <span className="text-sm text-gray-500">
            {completedCount} / {statements.length}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              statements.some((s) => s.status === 'failed')
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Statement list */}
      <div className="space-y-2">
        {statements.map((stmt) => (
          <div
            key={stmt.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${getStatusStyles(
              stmt.status
            )}`}
          >
            {/* Status icon */}
            <div className="flex-shrink-0 mt-0.5">
              <StatusIcon status={stmt.status} />
            </div>

            {/* Statement info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  语句 #{stmt.orderIndex + 1}
                </span>
                {stmt.durationMs !== undefined && (
                  <span className="text-xs text-gray-500">
                    ({(stmt.durationMs / 1000).toFixed(2)}s)
                  </span>
                )}
              </div>
              <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
                {stmt.sqlText.length > 200
                  ? `${stmt.sqlText.slice(0, 200)}...`
                  : stmt.sqlText}
              </pre>

              {/* Result info */}
              {stmt.status === 'succeeded' && (
                <div className="mt-1 text-xs text-green-700">
                  {stmt.affectedRows !== null && stmt.affectedRows !== undefined && (
                    <span>影响行数: {stmt.affectedRows.toLocaleString()}</span>
                  )}
                  {stmt.resultRowCount !== null && stmt.resultRowCount !== undefined && (
                    <span>返回行数: {stmt.resultRowCount.toLocaleString()}</span>
                  )}
                </div>
              )}

              {/* Error info */}
              {stmt.status === 'failed' && stmt.error && (
                <div className="mt-1 text-xs text-red-700">{stmt.error}</div>
              )}

              {/* Skipped info */}
              {stmt.status === 'skipped' && (
                <div className="mt-1 text-xs text-gray-500">
                  因前一语句失败而跳过
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: StatementProgressStatus }) {
  switch (status) {
    case 'pending':
      return (
        <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
      );
    case 'executing':
      return (
        <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      );
    case 'succeeded':
      return (
        <svg
          className="w-5 h-5 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'failed':
      return (
        <svg
          className="w-5 h-5 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'skipped':
      return (
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
  }
}

function getStatusStyles(status: StatementProgressStatus): string {
  switch (status) {
    case 'pending':
      return 'border-gray-200 bg-white';
    case 'executing':
      return 'border-blue-200 bg-blue-50';
    case 'succeeded':
      return 'border-green-200 bg-green-50';
    case 'failed':
      return 'border-red-200 bg-red-50';
    case 'skipped':
      return 'border-gray-200 bg-gray-50';
  }
}
