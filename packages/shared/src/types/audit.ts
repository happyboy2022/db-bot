/**
 * Audit action types
 */
export type AuditAction =
  | 'REQUEST_CREATED'
  | 'REQUEST_UPDATED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_CHANGES_REQUESTED'
  | 'EXECUTION_STARTED'
  | 'EXECUTION_COMPLETED'
  | 'EXECUTION_FAILED'
  | 'EXECUTION_TERMINATED'
  | 'USER_ROLE_CHANGED'
  | 'SESSION_KILLED';

/**
 * Audit log entry entity
 */
export interface AuditLog {
  id: string;
  action: AuditAction;
  userId: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
