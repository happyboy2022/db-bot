'use client';

import { useState } from 'react';
import type { RequestDetailStatement, RequestDetailTarget, StatementType } from '@/lib/queries/request-detail';
import { StatementExecuteButton, ExecutionHistory } from './statement-execution';

interface StatementListProps {
  statements: RequestDetailStatement[];
  canExecute?: boolean;
  isApprovedVersion?: boolean;
  targets?: RequestDetailTarget[];
}

const TYPE_CONFIG: Record<StatementType, { label: string; bgColor: string; textColor: string }> = {
  select: { label: 'SELECT', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  update: { label: 'UPDATE', bgColor: 'bg-amber-100', textColor: 'text-amber-800' },
  delete: { label: 'DELETE', bgColor: 'bg-red-100', textColor: 'text-red-800' },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; textColor: string; icon: string }
> = {
  PENDING: { label: '待执行', bgColor: 'bg-gray-100', textColor: 'text-gray-800', icon: 'clock' },
  EXECUTING: {
    label: '执行中',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    icon: 'spinner',
  },
  SUCCEEDED: {
    label: '成功',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    icon: 'check',
  },
  FAILED: { label: '失败', bgColor: 'bg-red-100', textColor: 'text-red-800', icon: 'x' },
  SKIPPED: { label: '跳过', bgColor: 'bg-gray-100', textColor: 'text-gray-800', icon: 'minus' },
};

export function StatementList({ statements, canExecute = false, isApprovedVersion = false, targets = [] }: StatementListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [historyOpenIds, setHistoryOpenIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleHistory = (id: string) => {
    setHistoryOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (statements.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
        此版本没有语句
      </div>
    );
  }

  // Can execute if request is approved/failed and this is the approved version
  const showExecuteButton = canExecute && isApprovedVersion;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-900">SQL 语句</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {statements.map((statement, index) => {
          const isExpanded = expandedIds.has(statement.id);
          const isHistoryOpen = historyOpenIds.has(statement.id);
          const typeConfig = TYPE_CONFIG[statement.type];
          const statusConfig = statement.execStatus ? STATUS_CONFIG[statement.execStatus] : null;

          return (
            <div key={statement.id} className="p-4">
              {/* Header row with execute button */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {index + 1}
                  </span>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${typeConfig.bgColor} ${typeConfig.textColor}`}
                  >
                    {typeConfig.label}
                  </span>
                  {statusConfig && (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}
                    >
                      {statusConfig.label}
                    </span>
                  )}
                  {statement.durationMs !== null && (
                    <span className="text-xs text-gray-500">{statement.durationMs}ms</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Execute button */}
                  {showExecuteButton && (
                    <StatementExecuteButton
                      statementId={statement.id}
                      canExecute={true}
                      targets={targets}
                    />
                  )}

                  {/* History button */}
                  <button
                    onClick={() => toggleHistory(statement.id)}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                      isHistoryOpen
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title="查看执行历史"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    历史
                  </button>

                  {/* Expand button */}
                  <button
                    onClick={() => toggleExpanded(statement.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg
                      className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* SQL Preview (always shown) */}
              <div className="mt-2 font-mono text-sm">
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-gray-800">
                  {isExpanded ? statement.sqlText : truncateSql(statement.sqlText)}
                </pre>
              </div>

              {/* Execution History Panel */}
              <ExecutionHistory
                statementId={statement.id}
                isOpen={isHistoryOpen}
                onClose={() => toggleHistory(statement.id)}
              />

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {/* Precheck SQL */}
                  {statement.precheckSql !== null && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-500">预检 SQL：</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-yellow-50 p-2 font-mono text-xs text-gray-800">
                        {statement.precheckSql}
                      </pre>
                    </div>
                  )}

                  {/* Execution Result (latest) */}
                  {statement.execResult !== null && statement.execResult !== undefined && (
                    <ExecutionResult
                      type={statement.type}
                      result={statement.execResult}
                      status={statement.execStatus}
                    />
                  )}

                  {/* Validation warnings/errors */}
                  {statement.validationResult !== null && statement.validationResult !== undefined && (
                    <ValidationResult result={statement.validationResult} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function truncateSql(sql: string, maxLength: number = 150): string {
  const singleLine = sql.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.slice(0, maxLength) + '...';
}

interface ExecutionResultProps {
  type: StatementType;
  result: unknown;
  status: string | null;
}

function ExecutionResult({ type, result, status }: ExecutionResultProps) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const execResult = result as {
    rows?: Array<Record<string, unknown>>;
    affectedRows?: number;
    error?: string;
  };

  if (status === 'FAILED' && execResult.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3">
        <div className="mb-1 text-xs font-medium text-red-800">错误：</div>
        <pre className="whitespace-pre-wrap font-mono text-xs text-red-700">{execResult.error}</pre>
      </div>
    );
  }

  if (type === 'select' && execResult.rows) {
    return <SelectResultTable rows={execResult.rows} />;
  }

  if ((type === 'update' || type === 'delete') && execResult.affectedRows !== undefined) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-3">
        <span className="text-sm text-green-800">
          影响了 {execResult.affectedRows} 行
        </span>
      </div>
    );
  }

  return null;
}

interface SelectResultTableProps {
  rows: Array<Record<string, unknown>>;
}

function SelectResultTable({ rows }: SelectResultTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
        未返回任何行
      </div>
    );
  }

  const columns = Object.keys(rows[0]);
  const displayRows = rows.slice(0, 100);
  const hasMore = rows.length > 100;

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">
        结果（{rows.length} 行）：
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-2 py-1 text-left font-medium text-gray-500"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {displayRows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-2 py-1 text-gray-700">
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-1 text-xs text-gray-500">
          显示前 100 行，共 {rows.length} 行
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface ValidationResultProps {
  result: unknown;
}

function ValidationResult({ result }: ValidationResultProps) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const validationResult = result as {
    errors?: Array<{ message: string }>;
    warnings?: Array<{ message: string }>;
  };

  const errors = validationResult.errors || [];
  const warnings = validationResult.warnings || [];

  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-2">
          <div className="mb-1 text-xs font-medium text-red-800">验证错误：</div>
          <ul className="list-inside list-disc text-xs text-red-700">
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-2">
          <div className="mb-1 text-xs font-medium text-yellow-800">验证警告：</div>
          <ul className="list-inside list-disc text-xs text-yellow-700">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
