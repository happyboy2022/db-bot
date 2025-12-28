'use client';

import { useState, useTransition } from 'react';

interface KillDialogProps {
  processId: number;
  sql: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function KillDialog({ processId, sql, onConfirm, onCancel }: KillDialogProps) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!reason.trim()) return;

    startTransition(() => {
      onConfirm(reason.trim());
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          确认终止会话
        </h2>

        <div className="mb-4 space-y-3">
          <div>
            <span className="text-sm font-medium text-gray-500">进程 ID：</span>
            <span className="ml-2 font-mono text-gray-900">{processId}</span>
          </div>

          {sql && (
            <div>
              <span className="text-sm font-medium text-gray-500">SQL：</span>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-100 p-2 font-mono text-xs text-gray-800">
                {sql}
              </pre>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">
            原因 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请输入终止此会话的原因..."
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            此操作将记录在审计日志中。
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending || !reason.trim()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? '终止中...' : '终止会话'}
          </button>
        </div>
      </div>
    </div>
  );
}
