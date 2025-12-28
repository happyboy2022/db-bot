'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  executeSingleStatement,
  getStatementExecutions,
  terminateExecution,
  isStatementExecuting,
} from '@/lib/execution/statement-executor';

interface ExecutionRecord {
  id: string;
  status: 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED';
  result: unknown;
  processId: number | null;
  durationMs: number | null;
  executedByEmail: string;
  executedByDisplayName: string | null;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}

interface ExecutionTarget {
  id: string;
  targetId: string;
  clusterDisplayName: string;
  targetDisplayName: string;
  dbType: string;
  code: string;
  execStatus: string | null;
}

interface StatementExecutionProps {
  statementId: string;
  canExecute: boolean;
  targets?: ExecutionTarget[];
  onExecutionComplete?: () => void;
}

/**
 * Statement execution button component
 */
export function StatementExecuteButton({
  statementId,
  canExecute,
  targets = [],
  onExecutionComplete,
}: StatementExecutionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showTargetSelector, setShowTargetSelector] = useState(false);

  // Check if statement is currently executing on mount
  useEffect(() => {
    async function checkExecution() {
      const executing = await isStatementExecuting(statementId);
      setIsExecuting(executing);
    }
    checkExecution();
  }, [statementId]);

  // Timer for elapsed time
  useEffect(() => {
    if (!isExecuting) {
      return;
    }
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => {
      clearInterval(interval);
      setElapsedTime(0);
    };
  }, [isExecuting]);

  const handleExecuteClick = () => {
    // 防止在执行中或等待中重复点击
    if (isExecuting || isPending) {
      return;
    }
    // If only one target, execute directly
    if (targets.length === 1) {
      executeWithTarget(targets[0].targetId);
    } else if (targets.length > 1) {
      // Show target selector
      setShowTargetSelector(true);
    }
  };

  const executeWithTarget = (targetId: string) => {
    // 防止在执行中或等待中重复执行
    if (isExecuting || isPending) {
      return;
    }

    setError(null);
    setIsExecuting(true);
    setElapsedTime(0);
    setShowTargetSelector(false);

    startTransition(async () => {
      const result = await executeSingleStatement(statementId, targetId);
      setIsExecuting(false);
      setCurrentExecutionId(result.executionId);

      if (!result.success) {
        setError(result.error ?? '执行失败');
      }

      router.refresh();
      onExecutionComplete?.();
    });
  };

  const handleTerminate = () => {
    if (!currentExecutionId) return;

    startTransition(async () => {
      const result = await terminateExecution(currentExecutionId);
      setIsExecuting(false);

      if (!result.success) {
        setError(result.error ?? '终止失败');
      }

      router.refresh();
      onExecutionComplete?.();
    });
  };

  if (!canExecute || targets.length === 0) {
    return null;
  }

  return (
    <div className="relative flex items-center gap-2">
      {isExecuting ? (
        <>
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>执行中... {elapsedTime}s</span>
          </div>
          <button
            onClick={handleTerminate}
            disabled={isPending}
            className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            终止
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleExecuteClick}
            disabled={isPending || isExecuting}
            className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {targets.length > 1 ? '选择目标执行' : '执行'}
          </button>

          {/* Target selector dropdown */}
          {showTargetSelector && targets.length > 1 && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[240px] rounded-md border border-gray-200 bg-white shadow-lg">
              <div className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
                选择执行目标
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {targets.map((target) => (
                  <button
                    key={target.targetId}
                    onClick={() => executeWithTarget(target.targetId)}
                    disabled={isPending || isExecuting}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {target.clusterDisplayName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {target.targetDisplayName} · {target.dbType} / {target.code}
                      </div>
                    </div>
                    {target.execStatus && (
                      <span
                        className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          target.execStatus === 'SUCCEEDED'
                            ? 'bg-green-100 text-green-700'
                            : target.execStatus === 'FAILED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {target.execStatus === 'SUCCEEDED'
                          ? '✓'
                          : target.execStatus === 'FAILED'
                          ? '✗'
                          : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 p-2">
                <button
                  onClick={() => setShowTargetSelector(false)}
                  className="w-full rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}

/**
 * Statement execution history panel
 */
interface ExecutionHistoryProps {
  statementId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExecutionHistory({ statementId, isOpen, onClose }: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const loadExecutions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getStatementExecutions(statementId);
      setExecutions(data);
      if (data.length > 0) {
        setSelectedExecutionId((prev) => prev ?? data[0].id);
      }
    } catch (error) {
      console.error('Failed to load executions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [statementId]);

  useEffect(() => {
    if (isOpen) {
      loadExecutions();
    }
  }, [isOpen, loadExecutions]);

  if (!isOpen) return null;

  const selectedExecution = executions.find((e) => e.id === selectedExecutionId);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h4 className="text-sm font-medium text-gray-900">执行历史</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-sm text-gray-500">加载中...</div>
      ) : executions.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-500">暂无执行记录</div>
      ) : (
        <div className="flex divide-x divide-gray-200">
          {/* Execution list */}
          <div className="w-48 flex-shrink-0">
            <div className="max-h-64 overflow-y-auto">
              {executions.map((execution) => (
                <button
                  key={execution.id}
                  onClick={() => setSelectedExecutionId(execution.id)}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                    selectedExecutionId === execution.id ? 'bg-white' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <ExecutionStatusBadge status={execution.status} />
                    {execution.durationMs !== null && (
                      <span className="text-gray-500">{execution.durationMs}ms</span>
                    )}
                  </div>
                  <div className="mt-1 text-gray-500">
                    {formatDateTime(execution.startedAt)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Execution detail */}
          <div className="min-w-0 flex-1 p-3">
            {selectedExecution ? (
              <ExecutionDetail execution={selectedExecution} />
            ) : (
              <div className="text-center text-sm text-gray-500">选择一条执行记录查看详情</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Execution status badge
 */
function ExecutionStatusBadge({ status }: { status: ExecutionRecord['status'] }) {
  const config: Record<ExecutionRecord['status'], { label: string; className: string }> = {
    EXECUTING: { label: '执行中', className: 'bg-blue-100 text-blue-800' },
    SUCCEEDED: { label: '成功', className: 'bg-green-100 text-green-800' },
    FAILED: { label: '失败', className: 'bg-red-100 text-red-800' },
    TERMINATED: { label: '已终止', className: 'bg-gray-100 text-gray-800' },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

/**
 * Execution detail view
 */
function ExecutionDetail({ execution }: { execution: ExecutionRecord }) {
  return (
    <div className="space-y-3 text-xs">
      {/* Meta info */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-gray-500">执行者：</span>
          <span className="text-gray-900">
            {execution.executedByDisplayName || execution.executedByEmail}
          </span>
        </div>
        <div>
          <span className="text-gray-500">开始时间：</span>
          <span className="text-gray-900">{formatDateTime(execution.startedAt)}</span>
        </div>
        {execution.completedAt && (
          <div>
            <span className="text-gray-500">完成时间：</span>
            <span className="text-gray-900">{formatDateTime(execution.completedAt)}</span>
          </div>
        )}
        {execution.durationMs !== null && (
          <div>
            <span className="text-gray-500">耗时：</span>
            <span className="text-gray-900">{execution.durationMs}ms</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {execution.errorMessage && (
        <div className="rounded border border-red-200 bg-red-50 p-2">
          <div className="font-medium text-red-800">错误信息：</div>
          <pre className="mt-1 whitespace-pre-wrap text-red-700">{execution.errorMessage}</pre>
        </div>
      )}

      {/* Result */}
      {execution.status === 'SUCCEEDED' && execution.result != null && (
        <ExecutionResultView result={execution.result} />
      )}
    </div>
  );
}

/**
 * Execution result view
 */
function ExecutionResultView({ result }: { result: unknown }) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const execResult = result as {
    rows?: Array<Record<string, unknown>>;
    columns?: string[];
    rowCount?: number;
    affectedRows?: number;
    truncated?: boolean;
  };

  // SELECT result
  if (execResult.rows && execResult.rows.length > 0) {
    const columns = execResult.columns || Object.keys(execResult.rows[0]);
    const displayRows = execResult.rows.slice(0, 50);
    const hasMore = execResult.rows.length > 50;

    return (
      <div>
        <div className="mb-1 font-medium text-gray-700">
          结果（{execResult.rowCount ?? execResult.rows.length} 行）
          {execResult.truncated && <span className="text-gray-500">（已截断）</span>}
        </div>
        <div className="max-h-48 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 border border-gray-200 text-xs">
            <thead className="bg-gray-100">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-2 py-1 text-left font-medium text-gray-600"
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
                    <td key={col} className="whitespace-nowrap px-2 py-1 text-gray-800">
                      {formatCellValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="mt-1 text-gray-500">显示前 50 行，共 {execResult.rows.length} 行</div>
        )}
      </div>
    );
  }

  // UPDATE/DELETE result
  if (execResult.affectedRows !== undefined) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-2">
        <span className="text-green-800">影响了 {execResult.affectedRows} 行</span>
      </div>
    );
  }

  return null;
}

function formatCellValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
