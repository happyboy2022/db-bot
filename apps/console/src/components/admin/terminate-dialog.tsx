'use client';

import { useState } from 'react';

interface TerminateDialogProps {
  requestId: string;
  sql: string;
  processId: number | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function TerminateDialog({
  requestId,
  sql,
  processId,
  onConfirm,
  onCancel,
}: TerminateDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          终止执行中的请求
        </h2>

        <div className="mt-4 space-y-4">
          {/* Request info */}
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-yellow-600"
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
              <div className="text-sm text-yellow-800">
                <p className="font-medium">确定要终止此请求吗？</p>
                <p className="mt-1">此操作将强制终止数据库执行，可能导致数据不一致。</p>
              </div>
            </div>
          </div>

          {/* Request details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Request ID:</span>
              <span className="font-mono text-gray-900">{requestId.slice(0, 16)}...</span>
            </div>
            {processId && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Process ID:</span>
                <span className="font-mono text-gray-900">{processId}</span>
              </div>
            )}
            <div className="text-sm">
              <span className="text-gray-500">SQL:</span>
              <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-all font-mono bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                {sql}
              </pre>
            </div>
          </div>

          {/* Reason input */}
          <form onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="terminateReason"
                className="block text-sm font-medium text-gray-700"
              >
                终止原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="terminateReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请输入终止原因..."
                rows={2}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !reason.trim()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? '终止中...' : '确认终止'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
