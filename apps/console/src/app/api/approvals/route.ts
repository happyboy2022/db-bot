import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPendingApprovalRequests } from '@/lib/queries/pending-requests';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const requests = await getPendingApprovalRequests();

    return NextResponse.json({
      requests,
      stats: {
        total: requests.length,
        hasWriteOperations: requests.filter((r) => r.hasWriteOperations).length,
        totalStatements: requests.reduce((sum, r) => sum + r.statementCount, 0),
      },
    });
  } catch (error) {
    console.error('获取审批列表失败:', error);
    return NextResponse.json({ error: '获取审批列表失败' }, { status: 500 });
  }
}
