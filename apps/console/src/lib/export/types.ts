import { z } from 'zod';
import type { RequestStatus } from '@/lib/queries/requests';
import type { StatementType, ApprovalDecision } from '@/lib/queries/request-detail';

/**
 * Export format version for compatibility checking
 */
export const EXPORT_VERSION = '1.0' as const;

/**
 * Exported statement structure
 */
export interface ExportedStatement {
  orderIndex: number;
  sqlText: string;
  type: StatementType;
  precheckSql: string | null;
}

/**
 * Exported version structure
 */
export interface ExportedVersion {
  version: number;
  sqlRaw: string;
  createdAt: string;
  createdByEmail: string;
  statements: ExportedStatement[];
}

/**
 * Exported approval record
 */
export interface ExportedApproval {
  versionNumber: number;
  decision: ApprovalDecision;
  comment: string | null;
  decidedByEmail: string;
  createdAt: string;
}

/**
 * Exported request structure
 */
export interface ExportedRequest {
  originalId: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  createdAt: string;
  createdByEmail: string;
  cluster: {
    name: string;
    region: string | null;
  };
  target: {
    displayName: string;
    dbType: string;
    code: string;
  };
  versions: ExportedVersion[];
  approvalHistory: ExportedApproval[];
}

/**
 * Root export structure
 */
export interface RequestExport {
  exportVersion: typeof EXPORT_VERSION;
  exportedAt: string;
  exportedBy: string;
  requests: ExportedRequest[];
}

/**
 * CSV export row structure
 */
export interface CsvExportRow {
  id: string;
  title: string;
  status: RequestStatus;
  clusterName: string;
  clusterRegion: string | null;
  targetDisplayName: string;
  dbType: string;
  code: string;
  currentVersion: number;
  createdAt: string;
  createdByEmail: string;
}

// Zod schemas for import validation

const statementSchema = z.object({
  orderIndex: z.number().int().min(0),
  sqlText: z.string().min(1),
  type: z.enum(['select', 'update', 'delete']),
  precheckSql: z.string().nullable(),
});

const versionSchema = z.object({
  version: z.number().int().min(1),
  sqlRaw: z.string().min(1),
  createdAt: z.string(),
  createdByEmail: z.string().email(),
  statements: z.array(statementSchema).min(1),
});

const approvalSchema = z.object({
  versionNumber: z.number().int().min(1),
  decision: z.enum(['APPROVE', 'REJECT', 'CHANGES_REQUESTED']),
  comment: z.string().nullable(),
  decidedByEmail: z.string().email(),
  createdAt: z.string(),
});

const requestSchema = z.object({
  originalId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  status: z.enum([
    'PENDING_APPROVAL',
    'CHANGES_REQUESTED',
    'REJECTED',
    'APPROVED',
    'APPROVAL_EXPIRED',
    'EXECUTING',
    'SUCCEEDED',
    'FAILED',
    'TERMINATED',
  ]),
  createdAt: z.string(),
  createdByEmail: z.string().email(),
  cluster: z.object({
    name: z.string(),
    region: z.string().nullable(),
  }),
  target: z.object({
    displayName: z.string(),
    dbType: z.string(),
    code: z.string(),
  }),
  versions: z.array(versionSchema).min(1),
  approvalHistory: z.array(approvalSchema),
});

export const requestExportSchema = z.object({
  exportVersion: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  exportedBy: z.string().email(),
  requests: z.array(requestSchema).min(1),
});

export type ValidatedRequestExport = z.infer<typeof requestExportSchema>;

/**
 * Import result for a single request
 */
export interface ImportResult {
  originalId: string;
  newId: string;
  title: string;
  success: boolean;
  error?: string;
}

/**
 * Overall import response
 */
export interface ImportResponse {
  success: boolean;
  imported: ImportResult[];
  failed: ImportResult[];
  totalCount: number;
  successCount: number;
  failedCount: number;
}
