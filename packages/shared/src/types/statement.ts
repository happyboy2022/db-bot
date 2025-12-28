import type { DbType } from '../constants/db-types';

/**
 * SQL statement type
 */
export type StatementType = 'select' | 'update' | 'delete';

/**
 * Statement execution status
 */
export type StatementStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED'
  | 'TERMINATED';

/**
 * Single execution status (for execution history records)
 */
export type ExecutionStatus = 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'TERMINATED';

/**
 * Statement execution history record
 */
export interface StatementExecution {
  id: string;
  statementId: string;
  status: ExecutionStatus;
  result: ExecutionResult | null;
  processId: number | null;
  durationMs: number | null;
  executedBy: string;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}

/**
 * Execution result data
 */
export interface ExecutionResult {
  rows?: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  affectedRows?: number;
  truncated?: boolean;
}

/**
 * Database code for statement execution (e.g. 'primary', 'record', 'main', 'log')
 */
export type DbCode = string;

/**
 * @deprecated Use DbCode instead
 */
export type DbRole = DbCode;

/**
 * Database type - defined in constants/db-types.ts and re-exported above
 */

/**
 * SQL Statement entity
 */
export interface SqlStatement {
  id: string;
  requestId: string;
  orderIndex: number;
  sql: string;
  statementType: StatementType;
  clusterId: string;
  dbType: DbType;
  code: DbCode;
  status: StatementStatus;
  affectedRows: number | null;
  resultRowCount: number | null;
  resultPreview: unknown | null;
  errorMessage: string | null;
  executedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}
