'use client';

/**
 * Precheck result display component
 * Shows the results of SQL precheck queries (affected row counts)
 */

export interface PrecheckStatement {
  index: number;
  sql: string;
  precheckSql: string;
  affectedCount: number | null;
  isLargeChange: boolean;
  error?: string;
}

interface PrecheckResultProps {
  statements: PrecheckStatement[];
  isLoading?: boolean;
}

const LARGE_CHANGE_THRESHOLD = 1000;

export function PrecheckResult({ statements, isLoading }: PrecheckResultProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">正在执行预检查...</h3>
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (statements.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        没有需要预检查的写操作
      </div>
    );
  }

  const totalAffected = statements.reduce(
    (sum, s) => sum + (s.affectedCount ?? 0),
    0
  );
  const hasLargeChange = statements.some((s) => s.isLargeChange);
  const hasErrors = statements.some((s) => s.error);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">预检查结果</h3>
        <div className="text-sm text-gray-500">
          总受影响行数：{' '}
          <span
            className={`font-medium ${
              totalAffected > LARGE_CHANGE_THRESHOLD
                ? 'text-yellow-600'
                : 'text-gray-900'
            }`}
          >
            {totalAffected.toLocaleString()}
          </span>
        </div>
      </div>

      {hasLargeChange && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm font-medium text-yellow-800">
              此操作影响超过 1,000 行，需要额外确认。
            </span>
          </div>
        </div>
      )}

      {hasErrors && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium text-red-800">
              部分预检查失败，请查看下方的错误信息。
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {statements.map((stmt) => (
          <div
            key={stmt.index}
            className={`rounded-lg border p-4 ${
              stmt.error
                ? 'border-red-200 bg-red-50'
                : stmt.isLargeChange
                  ? 'border-yellow-200 bg-yellow-50'
                  : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    语句 #{stmt.index + 1}
                  </span>
                  {stmt.isLargeChange && (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      大量变更
                    </span>
                  )}
                </div>
                <pre className="mt-1 overflow-x-auto text-xs text-gray-600 whitespace-pre-wrap break-all">
                  {stmt.sql.length > 200 ? `${stmt.sql.slice(0, 200)}...` : stmt.sql}
                </pre>
              </div>
              <div className="ml-4 flex-shrink-0">
                {stmt.error ? (
                  <span className="text-sm font-medium text-red-700">错误</span>
                ) : (
                  <div className="text-right">
                    <span className="text-sm text-gray-500">受影响：</span>
                    <span
                      className={`ml-1 text-sm font-bold ${
                        stmt.isLargeChange ? 'text-yellow-700' : 'text-gray-900'
                      }`}
                    >
                      {(stmt.affectedCount ?? 0).toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-500"> 行</span>
                  </div>
                )}
              </div>
            </div>

            {stmt.error && (
              <div className="mt-2 text-sm text-red-700">{stmt.error}</div>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                查看预检查 SQL
              </summary>
              <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-600">
                {stmt.precheckSql}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
