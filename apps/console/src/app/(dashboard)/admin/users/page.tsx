import { requireAdmin } from '@/lib/auth';
import { getUsers, type UserFilters } from '@/lib/queries/users';
import { UserList } from '@/components/admin/user-list';
import { UserFiltersPanel } from '@/components/admin/user-filters';
import { AddUserDialog } from '@/components/admin/add-user-dialog';

interface UsersPageProps {
  searchParams: Promise<{
    role?: string;
    status?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const filters: UserFilters = {
    role: params.role as UserFilters['role'] || null,
    status: params.status as UserFilters['status'] || null,
    search: params.search || null,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 20,
  };

  const { users, total, page, pageSize, totalPages } = await getUsers(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">用户管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理用户账户、角色和访问权限。
          </p>
        </div>
        <AddUserDialog />
      </div>

      <UserFiltersPanel currentFilters={filters} />

      <UserList
        users={users}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
      />
    </div>
  );
}
