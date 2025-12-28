'use client';

import { useState } from 'react';
import type { PendingRequest } from '@/lib/queries/pending-requests';

interface ApprovalDetailProps {
  request: PendingRequest;
}

const TYPE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  select: { label: 'SELECT', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  update: { label: 'UPDATE', bgColor: 'bg-amber-100', textColor: 'text-amber-800' },
  delete: { label: 'DELETE', bgColor: 'bg-red-100', textColor: 'text-red-800' },
};

export function ApprovalDetail({ request }: ApprovalDetailProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const version = request.currentVersion;

  if (!version) {
    return null;
  }

  return (
    <div className="p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between text-sm text-gray-600 hover:text-gray-900"
      >
        <span>
          {isExpanded ? '收起' : '展开'} SQL 语句 ({version.statements.length})
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

      {isExpanded && (
        <div className="mt-4 space-y-3">
          {/* Request Description */}
          {request.description && (
            <div className="rounded bg-gray-50 p-3">
              <div className="mb-1 text-xs font-medium text-gray-500">描述：</div>
              <div className="text-sm text-gray-700">{request.description}</div>
            </div>
          )}

          {/* Target Info */}
          <div className="rounded bg-gray-50 p-3">
            <div className="mb-1 text-xs font-medium text-gray-500">目标数据库：</div>
            <div className="text-sm text-gray-700">
              {request.clusterName} ({request.clusterRegion}) / {request.targetDisplayName} /{' '}
              {request.code}
            </div>
          </div>

          {/* SQL Statements */}
          <div className="space-y-2">
            {version.statements.map((statement, index) => {
              const typeConfig = TYPE_CONFIG[statement.type] || {
                label: statement.type.toUpperCase(),
                bgColor: 'bg-gray-100',
                textColor: 'text-gray-800',
              };

              return (
                <div
                  key={statement.id}
                  className="rounded border border-gray-200 bg-white p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                      {index + 1}
                    </span>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${typeConfig.bgColor} ${typeConfig.textColor}`}
                    >
                      {typeConfig.label}
                    </span>
                    {statement.precheckSql && (
                      <span className="inline-flex items-center rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800">
                        有预检
                      </span>
                    )}
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-xs text-gray-800">
                    {statement.sqlText}
                  </pre>
                  {statement.precheckSql && (
                    <div className="mt-2">
                      <div className="mb-1 text-xs font-medium text-yellow-700">
                        预检 SQL：
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-yellow-50 p-2 font-mono text-xs text-gray-800">
                        {statement.precheckSql}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
