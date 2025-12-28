'use client';

import { useState, useTransition } from 'react';
import type { AdminTemplate } from '@/lib/queries/templates';
import { createTemplate, updateTemplate } from '@/app/(dashboard)/admin/templates/actions';

interface TemplateDialogProps {
  template: AdminTemplate | null;
  onClose: () => void;
}

export function TemplateDialog({ template, onClose }: TemplateDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEditing = template !== null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateTemplate(template.id, formData)
        : await createTemplate(formData);

      if (result.success) {
        onClose();
      } else {
        setError(result.error || '发生错误');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? '编辑模板' : '创建模板'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={template?.name}
              required
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="模板名称"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700"
            >
              描述
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={template?.description || ''}
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="模板的简要描述"
            />
          </div>

          <div>
            <label
              htmlFor="dbType"
              className="block text-sm font-medium text-gray-700"
            >
              数据库类型 <span className="text-red-500">*</span>
            </label>
            <select
              id="dbType"
              name="dbType"
              defaultValue={template?.dbType || 'polardb_mysql'}
              required
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="polardb_mysql">PolarDB MySQL</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="tags"
              className="block text-sm font-medium text-gray-700"
            >
              标签
            </label>
            <input
              id="tags"
              name="tags"
              type="text"
              defaultValue={template?.tags?.join(', ') || ''}
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="逗号分隔的标签（如：清理, 迁移）"
            />
            <p className="mt-1 text-xs text-gray-500">
              多个标签用逗号分隔
            </p>
          </div>

          <div>
            <label
              htmlFor="sqlText"
              className="block text-sm font-medium text-gray-700"
            >
              SQL 模板 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="sqlText"
              name="sqlText"
              rows={10}
              defaultValue={template?.sqlText || ''}
              required
              disabled={isPending}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="输入 SQL 模板..."
            />
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending
                ? isEditing
                  ? '更新中...'
                  : '创建中...'
                : isEditing
                  ? '更新模板'
                  : '创建模板'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
