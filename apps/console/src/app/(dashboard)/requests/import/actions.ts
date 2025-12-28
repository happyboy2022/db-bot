'use server';

import { headers } from 'next/headers';
import { requireActiveUser } from '@/lib/auth';
import { parseImportFile, importRequests, previewImport } from '@/lib/export/importer';
import type { ImportResponse } from '@/lib/export/types';

interface PreviewResult {
  success: boolean;
  preview?: {
    requests: Array<{
      originalId: string;
      title: string;
      statementCount: number;
      hasWriteOperations: boolean;
      originalStatus: string;
      validationErrors: string[];
    }>;
    totalCount: number;
    validCount: number;
    invalidCount: number;
  };
  error?: string;
}

interface ImportResult {
  success: boolean;
  result?: ImportResponse;
  error?: string;
}

/**
 * Preview import file without actually importing
 */
export async function previewImportFile(fileContent: string): Promise<PreviewResult> {
  try {
    await requireActiveUser();

    const parseResult = parseImportFile(fileContent);
    if (!parseResult.success || !parseResult.data) {
      return { success: false, error: parseResult.error || 'Failed to parse file' };
    }

    const preview = previewImport(parseResult.data);
    return { success: true, preview };
  } catch (error) {
    console.error('Preview import error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Preview failed',
    };
  }
}

/**
 * Import requests from file content
 */
export async function importFromFile(
  fileContent: string,
  targetId: string
): Promise<ImportResult> {
  try {
    const user = await requireActiveUser();

    const parseResult = parseImportFile(fileContent);
    if (!parseResult.success || !parseResult.data) {
      return { success: false, error: parseResult.error || 'Failed to parse file' };
    }

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const result = await importRequests(parseResult.data, {
      targetId,
      userId: user.id,
      ipAddress,
      userAgent,
    });

    return { success: result.success, result };
  } catch (error) {
    console.error('Import error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Import failed',
    };
  }
}
