'use client';

import { useState } from 'react';

interface ExportButtonProps {
  requestIds: string[];
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
}

export function ExportButton({
  requestIds,
  variant = 'secondary',
  size = 'sm',
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleExport = async (format: 'json' | 'csv') => {
    if (requestIds.length === 0) return;

    setIsExporting(true);
    setShowDropdown(false);

    try {
      const ids = requestIds.join(',');
      const response = await fetch(`/requests/export?ids=${ids}&format=${format}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `export.${format}`;

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const baseClasses =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs'
      : 'px-4 py-2 text-sm';

  const variantClasses =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-500'
      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isExporting || requestIds.length === 0}
        className={`inline-flex items-center gap-1.5 rounded-md font-medium shadow-sm disabled:opacity-50 ${baseClasses} ${variantClasses}`}
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
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        {isExporting ? '导出中...' : '导出'}
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
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => handleExport('json')}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              导出为 JSON
            </button>
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              导出为 CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
