/**
 * Approval action type
 */
export type ApprovalAction = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

/**
 * Approval record entity
 */
export interface ApprovalRecord {
  id: string;
  requestId: string;
  reviewerId: string;
  action: ApprovalAction;
  comment: string | null;
  createdAt: Date;
}
