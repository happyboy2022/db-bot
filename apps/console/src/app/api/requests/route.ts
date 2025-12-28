import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRequests, type RequestStatus } from '@/lib/queries/requests';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    if (user.role === 'PENDING') {
      return NextResponse.json({ error: '账户待激活' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // 解析查询参数
    const status = searchParams.get('status');
    const clusterId = searchParams.get('clusterId');
    const hasWrites = searchParams.get('hasWrites');
    const page = searchParams.get('page');
    const pageSize = searchParams.get('pageSize');

    const isAdmin = user.role === 'ADMIN';

    const result = await getRequests(
      user.id,
      {
        status: status ? [status as RequestStatus] : undefined,
        clusterId: clusterId || undefined,
        hasWriteOperations:
          hasWrites === 'true' ? true : hasWrites === 'false' ? false : undefined,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 10,
      },
      isAdmin
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('获取请求列表失败:', error);
    return NextResponse.json({ error: '获取请求列表失败' }, { status: 500 });
  }
}
