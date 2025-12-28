import { requireAdmin } from '@/lib/auth';
import { getSessionTargets } from '@/lib/executor/sessions';
import { ExecutionManager } from '@/components/admin/execution-manager';

export default async function ExecutionsPage() {
  await requireAdmin();

  const targetsResult = await getSessionTargets();
  const targets = targetsResult.success ? targetsResult.targets || [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">执行中请求</h1>
        <p className="mt-1 text-sm text-gray-500">
          查看和管理当前正在执行的 SQL 请求。可以通过 RequestID 追踪和终止执行。
        </p>
      </div>

      {!targetsResult.success && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            无法连接到执行服务：{targetsResult.error}
          </p>
        </div>
      )}

      <ExecutionManager initialTargets={targets} />
    </div>
  );
}
