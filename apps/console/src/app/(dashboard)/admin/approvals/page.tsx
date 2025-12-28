import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

/**
 * 审批页面现已整合到 SQL 请求列表页面
 * 此页面重定向到带有待审批筛选条件的请求列表
 */
export default async function ApprovalsPage() {
  await requireAdmin();
  redirect('/requests?status=PENDING_APPROVAL');
}
