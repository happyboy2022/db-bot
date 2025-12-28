import { NextRequest, NextResponse } from 'next/server';
import { requireActiveUser } from '@/lib/auth';
import { exportRequestsToJson, exportRequestsToCsv } from '@/lib/export/exporter';

/**
 * GET /requests/export
 * Export requests to JSON or CSV format
 *
 * Query params:
 * - ids: comma-separated request IDs (required)
 * - format: 'json' or 'csv' (default: 'json')
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireActiveUser();
    const isAdmin = user.role === 'ADMIN';

    const searchParams = request.nextUrl.searchParams;
    const idsParam = searchParams.get('ids');
    const format = searchParams.get('format') || 'json';

    if (!idsParam) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: ids' },
        { status: 400 }
      );
    }

    const ids = idsParam.split(',').filter((id) => id.trim());

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid request IDs provided' },
        { status: 400 }
      );
    }

    if (format === 'csv') {
      const csv = await exportRequestsToCsv(ids, user.id, isAdmin);

      const filename = `requests-export-${new Date().toISOString().split('T')[0]}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: JSON format
    const data = await exportRequestsToJson(ids, user.email, user.id, isAdmin);

    const filename = `requests-export-${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      },
      { status: 500 }
    );
  }
}
