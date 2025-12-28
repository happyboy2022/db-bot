'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PrecheckResult, type PrecheckStatement } from './precheck-result';
import { ExecuteConfirmForm, type ConfirmData } from './execute-confirm-form';
import {
  ExecutionProgress,
  type StatementProgress,
  type StatementProgressStatus,
} from './execution-progress';
import {
  runPrecheck,
  startExecution,
  executeStatements,
} from '@/app/(dashboard)/requests/[id]/execute/actions';
import { terminateExecution } from '@/lib/execution/terminator';

const LARGE_CHANGE_THRESHOLD = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

export interface ExecuteDialogStatement {
  id: string;
  orderIndex: number;
  sqlText: string;
  type: 'select' | 'update' | 'delete';
  precheckSql: string | null;
}

interface ExecuteDialogProps {
  requestId: string;
  versionId: string;
  version: number;
  clusterId: string;
  dbType: string;
  code: string;
  statements: ExecuteDialogStatement[];
  onClose: () => void;
}

type Phase = 'ready' | 'precheck' | 'confirm' | 'executing' | 'complete' | 'error';

export function ExecuteDialog({
  requestId,
  versionId,
  version,
  clusterId,
  dbType,
  code,
  statements,
  onClose,
}: ExecuteDialogProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('ready');
  const [precheckStatements, setPrecheckStatements] = useState<PrecheckStatement[]>([]);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Execution state
  const [statementProgress, setStatementProgress] = useState<StatementProgress[]>([]);
  const [currentExecutingIndex] = useState(-1);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');

  // Get only write statements that need pre-check
  const writeStatements = statements.filter(
    (s) => s.type === 'update' || s.type === 'delete'
  );

  // Calculate total affected rows and large change status
  const totalAffectedRows = precheckStatements.reduce(
    (sum, s) => sum + (s.affectedCount ?? 0),
    0
  );
  const isLargeChange = totalAffectedRows > LARGE_CHANGE_THRESHOLD;

  // Run precheck on mount
  const runPrecheckQueries = useCallback(async () => {
    if (writeStatements.length === 0) {
      // No write operations - skip directly to confirm
      setPrecheckLoading(false);
      setPhase('confirm');
      return;
    }

    setPrecheckLoading(true);
    setPrecheckError(null);

    try {
      const results = await runPrecheck({
        clusterId,
        dbType,
        code,
        statements: writeStatements.map((s) => ({
          index: s.orderIndex,
          sql: s.sqlText,
          precheckSql: s.precheckSql ?? '',
        })),
      });

      if (!results.success) {
        setPrecheckError(results.error ?? '预检失败');
        setPhase('error');
        return;
      }

      const precheckResults: PrecheckStatement[] = results.results?.map((r) => ({
        index: r.index,
        sql: writeStatements.find((s) => s.orderIndex === r.index)?.sqlText ?? '',
        precheckSql: r.precheckSql,
        affectedCount: r.affectedCount,
        isLargeChange: (r.affectedCount ?? 0) > LARGE_CHANGE_THRESHOLD,
        error: r.error,
      })) ?? [];

      setPrecheckStatements(precheckResults);
      setPhase('confirm');
    } catch (e) {
      console.error('Pre-check failed:', e);
      setPrecheckError(e instanceof Error ? e.message : '预检失败');
      setPhase('error');
    } finally {
      setPrecheckLoading(false);
    }
  }, [clusterId, dbType, code, writeStatements]);

  // Start execution flow manually when user clicks "Start Execute"
  const handleStartExecute = () => {
    setPhase('precheck');
    runPrecheckQueries();
  };

  // Initialize statement progress
  const initializeProgress = () => {
    setStatementProgress(
      statements.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        sqlText: s.sqlText,
        status: 'pending' as StatementProgressStatus,
      }))
    );
  };

  // Handle execution confirmation and start execution
  const handleConfirm = async (confirmData: ConfirmData) => {
    startTransition(async () => {
      // Start execution (validates and sets status to EXECUTING)
      const startResult = await startExecution({
        requestId,
        versionId,
        version,
        confirmData: {
          inputRequestId: confirmData.inputRequestId,
          confirm: confirmData.confirm,
          expectedRows: parseInt(confirmData.expectedRows, 10),
          largeChangeConfirm: confirmData.largeChangeConfirm,
          reason: confirmData.reason,
        },
      });

      if (!startResult.success) {
        setPrecheckError(startResult.error ?? '启动执行失败');
        setPhase('error');
        return;
      }

      // Initialize progress and move to executing phase
      initializeProgress();
      setPhase('executing');

      // Execute statements
      const execResult = await executeStatements({
        requestId,
        versionId,
        version,
        clusterId,
        dbType,
        code,
        statements: statements.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          sqlText: s.sqlText,
          type: s.type,
        })),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });

      // Update progress with results
      if (execResult.success) {
        setStatementProgress((prev) =>
          prev.map((p) => {
            const result = execResult.results?.find((r) => r.statementId === p.id);
            if (result) {
              return {
                ...p,
                status: result.status.toLowerCase() as StatementProgressStatus,
                affectedRows: result.affectedRows,
                resultRowCount: result.resultRowCount,
                durationMs: result.durationMs,
                error: result.error,
              };
            }
            return p;
          })
        );
        setPhase('complete');
      } else {
        // Update progress with partial results
        if (execResult.results) {
          setStatementProgress((prev) =>
            prev.map((p) => {
              const result = execResult.results?.find((r) => r.statementId === p.id);
              if (result) {
                return {
                  ...p,
                  status: result.status.toLowerCase() as StatementProgressStatus,
                  affectedRows: result.affectedRows,
                  resultRowCount: result.resultRowCount,
                  durationMs: result.durationMs,
                  error: result.error,
                };
              }
              return p;
            })
          );
        }
        setExecutionError(execResult.error ?? '执行失败');
        setPhase('complete');
      }
    });
  };

  // Handle terminate execution
  const handleTerminate = async () => {
    if (!terminateReason.trim()) {
      return;
    }

    setIsTerminating(true);
    try {
      const result = await terminateExecution(requestId, terminateReason);
      if (result.success) {
        setShowTerminateConfirm(false);
        setPhase('complete');
        // Refresh to get updated status
        router.refresh();
      } else {
        setExecutionError(result.error ?? '终止失败');
      }
    } catch (e) {
      setExecutionError(e instanceof Error ? e.message : '终止失败');
    } finally {
      setIsTerminating(false);
    }
  };

  // Handle retry
  const handleRetry = () => {
    setPrecheckError(null);
    setExecutionError(null);
    handleStartExecute();
  };

  // Handle close after completion
  const handleComplete = () => {
    router.push(`/requests/${requestId}`);
    router.refresh();
    onClose();
  };

  // Determine if close is allowed
  const canClose =
    (phase === 'ready' || phase === 'confirm' || phase === 'complete' || phase === 'error') &&
    !isPending &&
    !precheckLoading &&
    !isTerminating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={canClose ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {phase === 'ready'
              ? '执行 SQL 请求'
              : phase === 'precheck'
                ? '正在预检...'
                : phase === 'executing'
                  ? '正在执行 SQL...'
                  : phase === 'complete'
                    ? '执行完成'
                    : '执行 SQL 请求'}
          </h2>
          {canClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="h-6 w-6"
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
        </div>

        {/* Content */}
        {phase === 'ready' && (
          <div className="space-y-6">
            {/* SQL Statements Preview */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                将执行以下 {statements.length} 条 SQL 语句：
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {statements.map((stmt, idx) => (
                  <div
                    key={stmt.id}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        #{idx + 1}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          stmt.type === 'select'
                            ? 'bg-blue-100 text-blue-700'
                            : stmt.type === 'update'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {stmt.type.toUpperCase()}
                      </span>
                    </div>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all font-mono">
                      {stmt.sqlText.length > 200
                        ? stmt.sqlText.slice(0, 200) + '...'
                        : stmt.sqlText}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning for write operations */}
            {writeStatements.length > 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
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
                    <p className="font-medium">
                      包含 {writeStatements.length} 个写操作
                    </p>
                    <p className="mt-1">
                      {'点击"开始执行"后将先进行预检，确认受影响的行数。'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStartExecute}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                开始执行
              </button>
            </div>
          </div>
        )}

        {phase === 'precheck' && (
          <PrecheckResult statements={precheckStatements} isLoading={precheckLoading} />
        )}

        {phase === 'confirm' && (
          <div className="space-y-6">
            {/* Show precheck results if there are write statements */}
            {writeStatements.length > 0 && (
              <PrecheckResult statements={precheckStatements} />
            )}

            {/* Divider */}
            {writeStatements.length > 0 && (
              <div className="border-t border-gray-200" />
            )}

            {/* Confirmation form */}
            <ExecuteConfirmForm
              requestId={requestId}
              expectedRowCount={totalAffectedRows}
              isLargeChange={isLargeChange}
              isPending={isPending}
              onConfirm={handleConfirm}
              onCancel={onClose}
            />
          </div>
        )}

        {phase === 'executing' && (
          <div className="space-y-4">
            <ExecutionProgress
              statements={statementProgress}
              currentIndex={currentExecutingIndex}
              isComplete={false}
            />

            {/* Terminate button */}
            {!showTerminateConfirm ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTerminateConfirm(true)}
                  disabled={isPending}
                  className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  终止执行
                </button>
              </div>
            ) : (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3">
                <p className="text-sm font-medium text-red-800">
                  确定要终止此执行吗？
                </p>
                <div>
                  <label
                    htmlFor="terminateReason"
                    className="block text-sm font-medium text-red-700"
                  >
                    原因 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="terminateReason"
                    type="text"
                    value={terminateReason}
                    onChange={(e) => setTerminateReason(e.target.value)}
                    placeholder="请输入终止原因"
                    className="mt-1 block w-full rounded-md border border-red-300 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    disabled={isTerminating}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTerminateConfirm(false)}
                    disabled={isTerminating}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleTerminate}
                    disabled={isTerminating || !terminateReason.trim()}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTerminating ? '终止中...' : '终止'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'complete' && (
          <div className="space-y-4">
            <ExecutionProgress
              statements={statementProgress}
              currentIndex={-1}
              isComplete={true}
            />

            {/* Error message */}
            {executionError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{executionError}</p>
              </div>
            )}

            {/* Success message */}
            {!executionError &&
              statementProgress.every((s) => s.status === 'succeeded') && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-700">
                    所有语句执行成功！
                  </p>
                </div>
              )}

            {/* Action buttons */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleComplete}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                完成
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-red-600"
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
                <div>
                  <h3 className="text-sm font-medium text-red-800">错误</h3>
                  <p className="mt-1 text-sm text-red-700">{precheckError}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                重试
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
