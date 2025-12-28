'use client';

import { useState, FormEvent } from 'react';

/**
 * Execute confirmation form component
 * Requires user to confirm by entering request ID, CONFIRM, and expected row count
 */

export interface ConfirmData {
  inputRequestId: string;
  confirm: string;
  expectedRows: string;
  largeChangeConfirm?: string;
  reason?: string;
}

interface ExecuteConfirmFormProps {
  requestId: string;
  expectedRowCount: number;
  isLargeChange: boolean;
  isPending: boolean;
  onConfirm: (data: ConfirmData) => void;
  onCancel: () => void;
}

const LARGE_CHANGE_THRESHOLD = 1000;

export function ExecuteConfirmForm({
  requestId,
  expectedRowCount,
  isLargeChange,
  isPending,
  onConfirm,
  onCancel,
}: ExecuteConfirmFormProps) {
  const [formData, setFormData] = useState<ConfirmData>({
    inputRequestId: '',
    confirm: '',
    expectedRows: '',
    largeChangeConfirm: '',
    reason: '',
  });
  const [errors, setErrors] = useState<string[]>([]);

  // Get short ID for display (first 8 characters)
  const shortRequestId = requestId.slice(0, 8);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const newErrors: string[] = [];

    // Validate request ID (accept both full and short ID)
    if (
      formData.inputRequestId !== requestId &&
      formData.inputRequestId !== shortRequestId
    ) {
      newErrors.push(`请求 ID 不匹配。应为：${shortRequestId}`);
    }

    // Validate CONFIRM
    if (formData.confirm !== 'CONFIRM') {
      newErrors.push('请输入 CONFIRM 以继续');
    }

    // Validate expected row count
    const expectedRows = parseInt(formData.expectedRows, 10);
    if (isNaN(expectedRows)) {
      newErrors.push('预期行数必须是数字');
    } else if (expectedRows !== expectedRowCount) {
      newErrors.push(
        `预期行数不匹配。预检查显示 ${expectedRowCount.toLocaleString()} 行`
      );
    }

    // Large change confirmation
    if (isLargeChange) {
      if (formData.largeChangeConfirm !== 'CONFIRM_LARGE_CHANGE') {
        newErrors.push('请输入 CONFIRM_LARGE_CHANGE 以确认大量变更');
      }
      if (!formData.reason?.trim()) {
        newErrors.push('大量变更需要提供原因');
      }
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors([]);
    onConfirm(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-start gap-2">
          <svg
            className="h-5 w-5 flex-shrink-0 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium">确认执行</p>
            <p className="mt-1">
              此操作将在目标数据库上执行 SQL 语句。
              请仔细核实详细信息。
            </p>
          </div>
        </div>
      </div>

      {/* Request ID */}
      <div>
        <label
          htmlFor="inputRequestId"
          className="block text-sm font-medium text-gray-700"
        >
          输入请求 ID
          <span className="ml-1 text-gray-400 font-normal">
            ({shortRequestId})
          </span>
        </label>
        <input
          id="inputRequestId"
          type="text"
          value={formData.inputRequestId}
          onChange={(e) =>
            setFormData({ ...formData, inputRequestId: e.target.value })
          }
          placeholder={shortRequestId}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
          disabled={isPending}
          autoComplete="off"
        />
      </div>

      {/* CONFIRM */}
      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-gray-700"
        >
          输入 CONFIRM 以继续
        </label>
        <input
          id="confirm"
          type="text"
          value={formData.confirm}
          onChange={(e) =>
            setFormData({ ...formData, confirm: e.target.value })
          }
          placeholder="CONFIRM"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
          disabled={isPending}
          autoComplete="off"
        />
      </div>

      {/* Expected Rows */}
      <div>
        <label
          htmlFor="expectedRows"
          className="block text-sm font-medium text-gray-700"
        >
          输入预期受影响的行数
          <span className="ml-1 text-gray-400 font-normal">
            ({expectedRowCount.toLocaleString()})
          </span>
        </label>
        <input
          id="expectedRows"
          type="number"
          value={formData.expectedRows}
          onChange={(e) =>
            setFormData({ ...formData, expectedRows: e.target.value })
          }
          placeholder={expectedRowCount.toString()}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
          disabled={isPending}
        />
      </div>

      {/* Large Change Confirmation */}
      {isLargeChange && (
        <>
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-yellow-600"
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
              <span className="text-sm font-medium text-yellow-800">
                大量变更：{expectedRowCount.toLocaleString()} 行
                （超过 {LARGE_CHANGE_THRESHOLD.toLocaleString()} 阈值）
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="largeChangeConfirm"
              className="block text-sm font-medium text-gray-700"
            >
              输入 CONFIRM_LARGE_CHANGE
            </label>
            <input
              id="largeChangeConfirm"
              type="text"
              value={formData.largeChangeConfirm}
              onChange={(e) =>
                setFormData({ ...formData, largeChangeConfirm: e.target.value })
              }
              placeholder="CONFIRM_LARGE_CHANGE"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 sm:text-sm"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-gray-700"
            >
              大量变更的原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reason"
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              placeholder="请说明为何需要此大量变更..."
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 sm:text-sm"
              disabled={isPending}
            />
          </div>
        </>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '执行中...' : '执行 SQL'}
        </button>
      </div>
    </form>
  );
}
