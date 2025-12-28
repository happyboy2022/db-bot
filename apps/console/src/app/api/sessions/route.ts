import { NextResponse } from 'next/server';
import { getSessions, type SessionFilterOptions } from '@/lib/executor/sessions';
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

    // Parse filter options
    const filterByConfiguredUser = searchParams.get('filterByConfiguredUser');
    const excludeIdleSessions = searchParams.get('excludeIdleSessions');

    const filterOptions: SessionFilterOptions = {
      filterByConfiguredUser: filterByConfiguredUser === null ? true : filterByConfiguredUser === 'true',
      excludeIdleSessions: excludeIdleSessions === null ? true : excludeIdleSessions === 'true',
    };

    if (!clusterId || !code) {
      return NextResponse.json(
        { success: false, error: 'Missing clusterId or code' },
        { status: 400 }
      );
    }

    const result = await getSessions(clusterId, code, dbType, undefined, filterOptions);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to get sessions:', e);
    return NextResponse.json(
      { success: false, error: 'Unauthorized or server error' },
      { status: 500 }
    );
  }
}
