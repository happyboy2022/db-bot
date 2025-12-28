import { NextResponse } from 'next/server';
import { listExecutingRequests } from '@/lib/executor/requests';
import { requireAdmin } from '@/lib/auth';
import { isValidDbType, DEFAULT_DB_TYPE } from '@sql-ops/shared';

export async function GET(request: Request) {
  try {
    // Verify admin access
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const code = searchParams.get('code');
    const dbTypeParam = searchParams.get('dbType');
    const dbType = dbTypeParam && isValidDbType(dbTypeParam) ? dbTypeParam : DEFAULT_DB_TYPE;

    const result = await listExecutingRequests(
      clusterId ?? undefined,
      dbType,
      code ?? undefined
    );

    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to get executing requests:', e);
    return NextResponse.json(
      { success: false, error: 'Unauthorized or server error' },
      { status: 500 }
    );
  }
}
