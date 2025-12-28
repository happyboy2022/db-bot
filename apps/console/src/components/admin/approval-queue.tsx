'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApprovalDetail } from './approval-detail';
import { ApprovalDialog } from './approval-dialog';
import { CountdownTimer } from '@/components/shared/countdown-timer';
import type { PendingRequest } from '@/lib/queries/pending-requests';

interface ApprovalQueueProps {
  requests: PendingRequest[];
}

export function ApprovalQueue({ requests }: ApprovalQueueProps) {
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | 'changes'>('approve');

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const handleAction = (request: PendingRequest, action: 'approve' | 'reject' | 'changes') => {
    setSelectedRequest(request);
    setDialogAction(action);
    setShowDialog(true);
  };

  const handleDialogClose = () => {
    setShowDialog(false);
    setSelectedRequest(null);
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-semibold text-gray-900">暂无待审批请求</h3>
        <p className="mt-1 text-sm text-gray-500">
          所有 SQL 请求已审核完毕。请稍后再来查看新请求。
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {requests.map((request) => (
          <div
            key={request.id}
            className="rounded-lg border border-gray-200 bg-white shadow-sm"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 p-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/requests/${request.id}`}
                    className="text-lg font-medium text-gray-900 hover:text-blue-600 hover:underline"
                  >
                    {request.title}
                  </Link>
                  <CountdownTimer createdAt={request.createdAt} />
                  {request.hasWriteOperations && (
                    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      <svg
                        className="mr-1 h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      写操作
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                  <span>
                    提交者: {request.createdByDisplayName || request.createdByEmail}
                  </span>
                  <span>|</span>
                  <span>{formatDate(request.createdAt)}</span>
                  <span>|</span>
                  <span>
                    {request.clusterName} / {request.targetDisplayName}
                  </span>
                  <span>|</span>
                  <span>{request.statementCount} 条语句</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(request, 'approve')}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
                >
                  批准
                </button>
                <button
                  onClick={() => handleAction(request, 'changes')}
                  className="rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100"
                >
                  要求修改
                </button>
                <button
                  onClick={() => handleAction(request, 'reject')}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  拒绝
                </button>
              </div>
            </div>

            {/* Detail */}
            <ApprovalDetail request={request} />
          </div>
        ))}
      </div>

      {/* Approval Dialog */}
      {selectedRequest && showDialog && (
        <ApprovalDialog
          request={selectedRequest}
          action={dialogAction}
          onClose={handleDialogClose}
        />
      )}
    </>
  );
}
