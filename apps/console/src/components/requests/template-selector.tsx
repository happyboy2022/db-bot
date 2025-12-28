'use client';

import { useState } from 'react';
import type { TemplateOption } from '@/lib/queries/templates';

interface TemplateSelectorProps {
  templates: TemplateOption[];
  dbType: string | null;
  onSelect: (template: TemplateOption) => void;
  disabled?: boolean;
}

export function TemplateSelector({
  templates,
  dbType,
  onSelect,
  disabled = false,
}: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter templates by DB type and search
  const filteredTemplates = templates.filter((t) => {
    if (dbType && t.dbType !== dbType) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  const handleSelect = (template: TemplateOption) => {
    onSelect(template);
    setIsOpen(false);
    setSearch('');
  };

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        使用模板
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 z-20 mt-2 w-96 rounded-md border border-gray-200 bg-white shadow-lg">
            {/* Search */}
            <div className="border-b p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索模板..."
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Template list */}
            <div className="max-h-64 overflow-auto p-2">
              {filteredTemplates.length === 0 ? (
                <p className="p-4 text-center text-sm text-gray-500">
                  {dbType
                    ? '该数据库类型暂无可用模板。'
                    : '未找到模板。'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredTemplates.map((template) => (
                    <li key={template.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(template)}
                        className="block w-full rounded-md px-3 py-2 text-left hover:bg-gray-100"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {template.name}
                        </div>
                        {template.description && (
                          <div className="text-xs text-gray-500">
                            {template.description}
                          </div>
                        )}
                        {template.tags && template.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {template.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
