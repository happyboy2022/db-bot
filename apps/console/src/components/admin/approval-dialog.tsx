'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveRequest, rejectRequest, requestChanges } from '@/app/(dashboard)/admin/approvals/actions';
import type { PendingRequest } from '@/lib/queries/pending-requests';

interface ApprovalDialogProps {
  request: PendingRequest;
  action: 'approve' | 'reject' | 'changes';
  onClose: () => void;
}

const ACTION_CONFIG = {
  approve: {
    title: '批准请求',
    description: '这将批准该 SQL 请求，允许在 24 小时内执行。',
    buttonText: '批准',
    buttonClass: 'bg-green-600 hover:bg-green-500',
    requiresComment: false,
  },
  reject: {
    title: '拒绝请求',
    description: '这将永久拒绝该 SQL 请求。请提供拒绝理由。',
    buttonText: '拒绝',
    buttonClass: 'bg-red-600 hover:bg-red-500',
    requiresComment: true,
  },
  changes: {
    title: '要求修改',
    description: '要求提交者修改请求。请提供反馈意见。',
    buttonText: '要求修改',
    buttonClass: 'bg-orange-600 hover:bg-orange-500',
    requiresComment: true,
  },
};

export function ApprovalDialog({ request, action, onClose }: ApprovalDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const config = ACTION_CONFIG[action];
  const versionId = request.currentVersionId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (config.requiresComment && !comment.trim()) {
      setError('请提供评论');
      return;
    }

    if (!versionId) {
      setError('无效的请求版本');
      return;
    }

    startTransition(async () => {
      let result;

      switch (action) {
        case 'approve':
          result = await approveRequest(request.id, versionId);
          break;
        case 'reject':
          result = await rejectRequest(request.id, versionId, comment);
          break;
        case 'changes':
          result = await requestChanges(request.id, versionId, comment);
          break;
      }

      if (result.success) {
        onClose();
        router.refresh();
      } else {
        setError(result.error || '发生错误');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
        <p className="mt-2 text-sm text-gray-500">{config.description}</p>

        <form onSubmit={handleSubmit} className="mt-4">
          {/* Request Summary */}
          <div className="mb-4 rounded bg-gray-50 p-3">
            <div className="text-sm font-medium text-gray-900">{request.title}</div>
            <div className="mt-1 text-xs text-gray-500">
              {request.statementCount} 条语句 | v
              {request.currentVersion?.version ?? 1}
            </div>
          </div>

          {/* Comment Input */}
          {config.requiresComment && (
            <div className="mb-4">
              <label
                htmlFor="comment"
                className="block text-sm font-medium text-gray-700"
              >
                {action === 'reject' ? '拒绝理由' : '反馈意见'}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                id="comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={
                  action === 'reject'
                    ? '请说明拒绝此请求的原因...'
                    : '请描述需要修改的内容...'
                }
              />
            </div>
          )}

          {/* Warning for approve */}
          {action === 'approve' && (
            <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3">
              <div className="flex items-start">
                <svg
                  className="mr-2 h-5 w-5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-sm text-yellow-800">
                  批准此请求将允许提交者或管理员对目标数据库执行这些 SQL 语句。
                  {request.hasWriteOperations && (
                    <strong className="block mt-1">
                      此请求包含写操作（UPDATE/DELETE）。
                    </strong>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${config.buttonClass}`}
            >
              {isPending ? '处理中...' : config.buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
