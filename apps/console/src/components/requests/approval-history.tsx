import type { ReactNode } from 'react';
import type { RequestDetailApproval, ApprovalDecision } from '@/lib/queries/request-detail';

interface ApprovalHistoryProps {
  approvals: RequestDetailApproval[];
}

const DECISION_CONFIG: Record<
  ApprovalDecision,
  { label: string; bgColor: string; textColor: string; icon: ReactNode }
> = {
  APPROVE: {
    label: '已批准',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  REJECT: {
    label: '已拒绝',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  CHANGES_REQUESTED: {
    label: '需要修改',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    ),
  },
};

export function ApprovalHistory({ approvals }: ApprovalHistoryProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  if (approvals.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-medium text-gray-900">审批历史</h3>
        </div>
        <div className="p-6 text-center text-sm text-gray-500">暂无审批记录</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-900">审批历史</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {approvals.map((approval) => {
          const config = DECISION_CONFIG[approval.decision];
          return (
            <div key={approval.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}
                  >
                    {config.icon}
                    {config.label}
                  </span>
                  <span className="text-xs text-gray-500">on v{approval.versionNumber}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(approval.createdAt)}</span>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <span className="font-medium">
                  {approval.decidedByDisplayName || approval.decidedByEmail}
                </span>
              </div>
              {approval.comment && (
                <div className="mt-2 rounded bg-gray-50 p-2 text-sm text-gray-700">
                  {approval.comment}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
