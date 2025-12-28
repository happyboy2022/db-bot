/**
 * Request status in the workflow
 */
export type RequestStatus =
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'APPROVAL_EXPIRED'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TERMINATED';

/**
 * SQL Request entity
 */
export interface SqlRequest {
  id: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  createdById: string;
  reviewedById: string | null;
  executedById: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Status transition map for requests
 */
export const REQUEST_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['PENDING_APPROVAL'],
  REJECTED: [],
  APPROVED: ['EXECUTING', 'APPROVAL_EXPIRED', 'REJECTED'],
  APPROVAL_EXPIRED: ['PENDING_APPROVAL'],
  EXECUTING: ['SUCCEEDED', 'FAILED', 'TERMINATED'],
  SUCCEEDED: [],
  FAILED: [],
  TERMINATED: [],
};
