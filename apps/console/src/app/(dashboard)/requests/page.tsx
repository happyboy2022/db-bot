import Link from 'next/link';
import { requireActiveUser } from '@/lib/auth';
import { getRequests, type RequestStatus } from '@/lib/queries/requests';
import { getPendingCount } from '@/lib/queries/pending-requests';
import { getClusterOptions } from '@/lib/queries/targets';
import { RequestList } from '@/components/requests/request-list';
import { RequestFilters } from '@/components/requests/request-filters';
import { ExportButton } from '@/components/requests/export-button';

interface RequestsPageProps {
  searchParams: Promise<{
    status?: string;
    clusterId?: string;
    hasWrites?: string;
    page?: string;
  }>;
}

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  // 并行获取用户信息和集群列表（不依赖用户信息）
  const [user, clusters, params] = await Promise.all([
    requireActiveUser(),
    getClusterOptions(),
    searchParams,
  ]);

  // Parse filters from search params
  const status = params.status as RequestStatus | undefined;
  const page = params.page ? parseInt(params.page, 10) : 1;
  const hasWriteOperations =
    params.hasWrites === 'true' ? true : params.hasWrites === 'false' ? false : undefined;

  const isAdmin = user.role === 'ADMIN';

  // 并行获取请求列表和待审批数量（管理员才需要待审批数量）
  const [requests, pendingCount] = await Promise.all([
    getRequests(
      user.id,
      {
        status: status ? [status] : undefined,
        clusterId: params.clusterId,
        hasWriteOperations,
        page,
        pageSize: 10,
      },
      isAdmin
    ),
    isAdmin ? getPendingCount() : Promise.resolve(0),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SQL 请求</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin ? '查看所有 SQL 执行请求' : '查看您的 SQL 执行请求'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin/sessions"
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 shadow-sm hover:bg-orange-100"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              会话管理
            </Link>
          )}
          <ExportButton requestIds={requests.items.map((r) => r.id)} />
          <Link
            href="/requests/import"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            导入
          </Link>
          <Link
            href="/requests/new"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            <svg
              className="-ml-0.5 mr-1.5 h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            新建请求
          </Link>
        </div>
      </div>

      <RequestFilters clusters={clusters} isAdmin={isAdmin} pendingCount={pendingCount} />

      <RequestList requests={requests} isAdmin={isAdmin} />
    </div>
  );
}
