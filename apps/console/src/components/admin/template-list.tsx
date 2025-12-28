'use client';

import { useState, useTransition } from 'react';
import type { AdminTemplate } from '@/lib/queries/templates';
import { TemplateDialog } from './template-dialog';
import { toggleTemplate, deleteTemplate } from '@/app/(dashboard)/admin/templates/actions';

interface TemplateListProps {
  templates: AdminTemplate[];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function TemplateList({ templates }: TemplateListProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AdminTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminTemplate | null>(null);

  const handleToggle = (template: AdminTemplate) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleTemplate(template.id, !template.enabled);
      if (!result.success) {
        setError(result.error || '切换模板状态失败');
      }
    });
  };

  const handleDelete = (template: AdminTemplate) => {
    setConfirmDelete(template);
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplate(confirmDelete.id);
      if (!result.success) {
        setError(result.error || '删除模板失败');
      }
      setConfirmDelete(null);
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateDialog(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          创建模板
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center">
          <p className="text-gray-500">未找到模板。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  数据库类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  标签
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  更新时间
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {templates.map((template) => (
                <tr
                  key={template.id}
                  className={`hover:bg-gray-50 ${!template.enabled ? 'opacity-60' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">
                        {template.name}
                      </div>
                      {template.description && (
                        <div className="max-w-xs truncate text-sm text-gray-500">
                          {template.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                      {template.dbType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {template.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        template.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {template.enabled ? '已启用' : '已禁用'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(template.updatedAt)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingTemplate(template)}
                        disabled={isPending}
                        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleToggle(template)}
                        disabled={isPending}
                        className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
                      >
                        {template.enabled ? '禁用' : '启用'}
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        disabled={isPending}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(showCreateDialog || editingTemplate) && (
        <TemplateDialog
          template={editingTemplate}
          onClose={() => {
            setShowCreateDialog(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              删除模板
            </h3>
            <p className="mb-6 text-sm text-gray-600">
              确定要删除 &quot;{confirmDelete.name}&quot; 吗？
              此操作无法撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={isPending}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteAction}
                disabled={isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
