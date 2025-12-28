import type { RequestStatus, StatementStatus, ExecutionStatus } from '../types';

/**
 * Request statuses that can be approved
 */
export const APPROVABLE_STATUSES: RequestStatus[] = ['PENDING_APPROVAL'];

/**
 * Request statuses that can be rejected by admin
 * Note: APPROVED requests can still be rejected before execution
 */
export const REJECTABLE_STATUSES: RequestStatus[] = ['PENDING_APPROVAL', 'APPROVED'];

/**
 * Request statuses that allow statement execution
 * Note: APPROVED allows initial execution, FAILED allows re-execution
 */
export const EXECUTABLE_STATUSES: RequestStatus[] = ['APPROVED', 'FAILED'];

/**
 * Request statuses that are final (no further transitions)
 */
export const FINAL_STATUSES: RequestStatus[] = [
  'REJECTED',
  'SUCCEEDED',
  'TERMINATED',
];

/**
 * Statement statuses that are final
 */
export const FINAL_STATEMENT_STATUSES: StatementStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
];

/**
 * Execution statuses that are final
 */
export const FINAL_EXECUTION_STATUSES: ExecutionStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'TERMINATED',
];

/**
 * Request statuses visible to regular users
 */
export const USER_VISIBLE_STATUSES: RequestStatus[] = [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVED',
  'APPROVAL_EXPIRED',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'TERMINATED',
];

/**
 * Statement status transition map
 * Defines valid state transitions for individual SQL statements
 */
export const STATEMENT_STATUS_TRANSITIONS: Record<StatementStatus, StatementStatus[]> = {
  PENDING: ['EXECUTING', 'SKIPPED'],
  EXECUTING: ['SUCCEEDED', 'FAILED', 'TERMINATED'],
  SUCCEEDED: [],
  FAILED: [],
  SKIPPED: [],
  TERMINATED: [],
};

/**
 * Validates if a statement status transition is allowed
 * @param from - Current statement status
 * @param to - Target statement status
 * @returns true if transition is valid, false otherwise
 */
export function canTransitionStatementTo(
  from: StatementStatus,
  to: StatementStatus
): boolean {
  const allowedTransitions = STATEMENT_STATUS_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Mapping from StatementStatus to ExecutionStatus
 * Only statuses that exist in both types can be mapped
 */
export const STATEMENT_TO_EXECUTION_STATUS_MAP: Partial<
  Record<StatementStatus, ExecutionStatus>
> = {
  EXECUTING: 'EXECUTING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TERMINATED: 'TERMINATED',
};

/**
 * Check if a StatementStatus can be mapped to ExecutionStatus
 * @param status - The statement status to check
 * @returns true if the status exists in ExecutionStatus
 */
export function canMapToExecutionStatus(
  status: StatementStatus
): status is StatementStatus & ExecutionStatus {
  return status in STATEMENT_TO_EXECUTION_STATUS_MAP;
}

/**
 * Convert StatementStatus to ExecutionStatus
 * @param status - The statement status to convert
 * @returns The ExecutionStatus or null if not mappable
 */
export function toExecutionStatus(
  status: StatementStatus
): ExecutionStatus | null {
  return STATEMENT_TO_EXECUTION_STATUS_MAP[status] ?? null;
}
