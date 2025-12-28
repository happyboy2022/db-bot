import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getDb } from '@/db';
import { auditLogs } from '@/db/schema';
import { killSession } from '@/lib/executor/sessions';
import { requireAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/security/csrf';

export async function POST(request: Request) {
  try {
    // CSRF 保护 - 验证请求来源
    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Verify admin access
    const admin = await requireAdmin();

    const body = await request.json();
    const { clusterId, dbType, code, processId, reason } = body;

    if (!clusterId || !code || !processId || !reason) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await killSession(clusterId, code, processId, reason, dbType);

    // If kill was successful, write to audit log
    if (result.success && result.killed) {
      const headersList = await headers();
      const ipAddress =
        headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headersList.get('x-real-ip') ||
        'unknown';
      const userAgent = headersList.get('user-agent') || 'unknown';

      await getDb().insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'session.kill',
        targetType: 'session',
        targetId: processId.toString(),
        payload: {
          clusterId,
          dbType,
          code,
          reason,
          wasSystemOwned: result.wasSystemOwned,
        },
        ipAddress,
        userAgent,
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to kill session:', e);
    return NextResponse.json(
      { success: false, error: 'Unauthorized or server error' },
      { status: 500 }
    );
  }
}
