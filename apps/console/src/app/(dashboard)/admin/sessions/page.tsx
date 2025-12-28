import { requireAdmin } from '@/lib/auth';
import { getSessionTargets } from '@/lib/executor/sessions';
import { SessionManager } from '@/components/admin/session-manager';

export default async function SessionsPage() {
  await requireAdmin();

  const targetsResult = await getSessionTargets();
  const targets = targetsResult.success ? targetsResult.targets || [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">会话管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          查看和管理活跃的数据库会话。可以在此终止长时间运行的查询。
        </p>
      </div>

      {!targetsResult.success && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            无法连接到执行服务：{targetsResult.error}
          </p>
        </div>
      )}

      <SessionManager initialTargets={targets} />
    </div>
  );
}
