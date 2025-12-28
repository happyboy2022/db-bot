'use client';

import type { ValidationResult, StatementValidation } from '@sql-ops/shared';

interface ValidationFeedbackProps {
  result: ValidationResult | null;
  isValidating?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  select: 'SELECT',
  update: 'UPDATE',
  delete: 'DELETE',
  forbidden: 'FORBIDDEN',
  unknown: 'UNKNOWN',
};

const TYPE_COLORS: Record<string, string> = {
  select: 'bg-blue-100 text-blue-800',
  update: 'bg-yellow-100 text-yellow-800',
  delete: 'bg-red-100 text-red-800',
  forbidden: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};

function StatementBadge({ statement }: { statement: StatementValidation }) {
  const colorClass = TYPE_COLORS[statement.type] || TYPE_COLORS.unknown;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${colorClass}`}
    >
      #{statement.index + 1} {TYPE_LABELS[statement.type] || statement.type}
      {statement.requiresPrecheck && (
        <span className="ml-1 text-yellow-600" title="需要预检查">
          !
        </span>
      )}
    </span>
  );
}

export function ValidationFeedback({
  result,
  isValidating = false,
}: ValidationFeedbackProps) {
  if (isValidating) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <svg className="h-4 w-4 animate-spin\" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          正在验证 SQL...
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">
          输入 SQL 以查看验证结果。
        </p>
      </div>
    );
  }

  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;
  const hasWriteOperations = result.statements.some((s) => s.requiresPrecheck);

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div
        className={`rounded-md border p-4 ${
          result.valid
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}
      >
        <div className="flex items-center gap-2">
          {result.valid ? (
            <>
              <svg
                className="h-5 w-5 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm font-medium text-green-800">
                验证通过 - {result.statements.length} 条语句
              </span>
            </>
          ) : (
            <>
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="text-sm font-medium text-red-800">
                验证失败
              </span>
            </>
          )}
        </div>
      </div>

      {/* Statement types */}
      {result.statements.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">语句列表</h4>
          <div className="flex flex-wrap gap-2">
            {result.statements.map((stmt) => (
              <StatementBadge key={stmt.index} statement={stmt} />
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-red-800">错误</h4>
          <ul className="space-y-1">
            {result.errors.map((error, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-red-700"
              >
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-yellow-800">警告</h4>
          <ul className="space-y-1">
            {result.warnings.map((warning, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-yellow-700"
              >
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-yellow-500" />
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Write operations notice */}
      {hasWriteOperations && result.valid && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-2">
            <svg
              className="h-5 w-5 flex-shrink-0 text-yellow-600"
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
            <div className="text-sm text-yellow-800">
              <p className="font-medium">包含写操作</p>
              <p className="mt-1">
                UPDATE/DELETE 语句在执行前需要配置预检查。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
