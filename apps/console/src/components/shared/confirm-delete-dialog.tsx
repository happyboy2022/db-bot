'use client';

import { useState } from 'react';

interface ConfirmDeleteDialogProps {
  /** 弹窗标题 */
  title: string;
  /** 描述文字，说明要删除什么 */
  description: React.ReactNode;
  /** 警告文字 */
  warningText: string;
  /** 需要用户输入的确认码 */
  confirmationCode: string;
  /** 确认码的标签文字（如"集群代号"、"数据库代号"） */
  confirmationLabel: string;
  /** 是否正在处理中 */
  isPending: boolean;
  /** 确认删除回调 */
  onConfirm: (confirmationCode: string) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * 通用删除确认弹窗组件
 *
 * 用于需要用户输入确认码才能执行的危险删除操作。
 *
 * @example
 * ```tsx
 * <ConfirmDeleteDialog
 *   title="删除集群"
 *   description={<>此操作将永久删除集群 <span className="font-semibold">"prod"</span></>}
 *   warningText="此操作无法撤销。删除后，相关数据将无法恢复。"
 *   confirmationCode="prod-cluster"
 *   confirmationLabel="集群代号"
 *   isPending={isDeleting}
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowDialog(false)}
 * />
 * ```
 */
export function ConfirmDeleteDialog({
  title,
  description,
  warningText,
  confirmationCode,
  confirmationLabel,
  isPending,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  const [input, setInput] = useState('');
  const isValid = input === confirmationCode;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onConfirm(input);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-600">{description}</p>
        </div>

        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex">
            <svg
              className="h-5 w-5 text-amber-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-amber-800">{warningText}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="confirmCode"
              className="block text-sm font-medium text-gray-700"
            >
              请输入{confirmationLabel}{' '}
              <code className="rounded bg-gray-100 px-1">{confirmationCode}</code>{' '}
              以确认删除
            </label>
            <input
              id="confirmCode"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isPending}
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-100"
              placeholder={`输入 ${confirmationCode}`}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!isValid || isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? '删除中...' : '确认删除'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
