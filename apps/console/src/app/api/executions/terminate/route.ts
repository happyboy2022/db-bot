import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getDb } from '@/db';
import { auditLogs } from '@/db/schema';
import { terminateRequestExecution } from '@/lib/executor/requests';
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
    const { clusterId, requestId, reason } = body;

    if (!clusterId || !requestId || !reason) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: clusterId, requestId, reason' },
        { status: 400 }
      );
    }

    const result = await terminateRequestExecution(
      clusterId,
      requestId,
      reason,
      admin.displayName || admin.email || admin.id
    );

    // If termination was successful, write to audit log
    if (result.success) {
      const headersList = await headers();
      const ipAddress =
        headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headersList.get('x-real-ip') ||
        'unknown';
      const userAgent = headersList.get('user-agent') || 'unknown';

      await getDb().insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'execution.terminate',
        targetType: 'request',
        targetId: requestId,
        payload: {
          clusterId,
          reason,
          killed: result.killed,
          processId: result.processId,
          wasExecuting: result.wasExecuting,
        },
        ipAddress,
        userAgent,
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to terminate execution:', e);
    return NextResponse.json(
      { success: false, error: 'Unauthorized or server error' },
      { status: 500 }
    );
  }
}
