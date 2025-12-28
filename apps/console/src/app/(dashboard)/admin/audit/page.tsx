import { requireAdmin } from '@/lib/auth';
import {
  getAuditLogs,
  getUniqueActions,
  getUniqueTargetTypes,
  type AuditFilters,
} from '@/lib/queries/audit-logs';
import { getUsers } from '@/lib/queries/users';
import { AuditLogList } from '@/components/admin/audit-log-list';
import { AuditFiltersPanel } from '@/components/admin/audit-filters';

interface AuditPageProps {
  searchParams: Promise<{
    action?: string;
    actorUserId?: string;
    targetType?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  }>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const filters: AuditFilters = {
    action: params.action || null,
    actorUserId: params.actorUserId || null,
    targetType: params.targetType || null,
    startDate: params.startDate ? new Date(params.startDate) : null,
    endDate: params.endDate ? new Date(params.endDate) : null,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 50,
  };

  // Fetch data in parallel
  const [auditData, actions, targetTypes, userData] = await Promise.all([
    getAuditLogs(filters),
    getUniqueActions(),
    getUniqueTargetTypes(),
    getUsers({ pageSize: 1000 }), // Get all users for the filter dropdown
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">审计日志</h1>
        <p className="mt-1 text-sm text-gray-500">
          查看所有系统活动和用户操作。
        </p>
      </div>

      <AuditFiltersPanel
        currentFilters={filters}
        actions={actions}
        targetTypes={targetTypes}
        users={userData.users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
        }))}
      />

      <AuditLogList
        logs={auditData.logs}
        total={auditData.total}
        page={auditData.page}
        pageSize={auditData.pageSize}
        totalPages={auditData.totalPages}
      />
    </div>
  );
}
