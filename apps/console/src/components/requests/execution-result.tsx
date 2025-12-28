import type { RequestDetailStatement } from '@/lib/queries/request-detail';

interface ExecutionResultSummaryProps {
  statements: RequestDetailStatement[];
}

export function ExecutionResultSummary({ statements }: ExecutionResultSummaryProps) {
  const executedStatements = statements.filter((s) => s.execStatus !== null);

  if (executedStatements.length === 0) {
    return null;
  }

  const succeeded = executedStatements.filter((s) => s.execStatus === 'SUCCEEDED').length;
  const failed = executedStatements.filter((s) => s.execStatus === 'FAILED').length;
  const skipped = executedStatements.filter((s) => s.execStatus === 'SKIPPED').length;
  const totalDuration = executedStatements.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  const lastExecuted = executedStatements
    .filter((s) => s.executedAt)
    .sort((a, b) => new Date(b.executedAt!).getTime() - new Date(a.executedAt!).getTime())[0];

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-900">执行摘要</h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded bg-green-50 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{succeeded}</div>
            <div className="text-xs text-green-800">成功</div>
          </div>
          <div className="rounded bg-red-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{failed}</div>
            <div className="text-xs text-red-800">失败</div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-gray-600">{skipped}</div>
            <div className="text-xs text-gray-800">跳过</div>
          </div>
          <div className="rounded bg-blue-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalDuration}ms</div>
            <div className="text-xs text-blue-800">总耗时</div>
          </div>
        </div>

        {lastExecuted && lastExecuted.executedAt && (
          <div className="mt-4 text-sm text-gray-600">
            最后执行于 {formatDate(lastExecuted.executedAt)}
            {lastExecuted.executedByDisplayName || lastExecuted.executedByEmail ? (
              <>，执行者：{lastExecuted.executedByDisplayName || lastExecuted.executedByEmail}</>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
