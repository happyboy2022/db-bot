'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { StatusBadge } from './status-badge';
import { VersionHistory } from './version-history';
import { StatementList } from './statement-list';
import { ApprovalHistory } from './approval-history';
import { ExecutionResultSummary } from './execution-result';
import { VersionDiff } from './version-diff';
import { ExportButton } from './export-button';
import type { RequestDetail as RequestDetailType, RequestDetailVersion } from '@/lib/queries/request-detail';

interface RequestDetailProps {
  request: RequestDetailType;
  isAdmin: boolean;
}

interface CompareState {
  leftVersion: RequestDetailVersion;
  rightVersion: RequestDetailVersion;
}

export function RequestDetail({ request, isAdmin }: RequestDetailProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    request.currentVersionId
  );
  const [compareState, setCompareState] = useState<CompareState | null>(null);

  const selectedVersion = request.versions.find((v) => v.id === selectedVersionId);

  // Calculate time remaining until expiration
  const calculateTimeRemaining = useCallback((): string | null => {
    if (request.status !== 'APPROVED' || !request.expiresAt) {
      return null;
    }
    const now = new Date();
    const expires = new Date(request.expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) {
      return '已过期';
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `剩余 ${hours}小时 ${minutes}分钟`;
  }, [request.status, request.expiresAt]);

  const [timeRemaining, setTimeRemaining] = useState<string | null>(() => calculateTimeRemaining());

  useEffect(() => {
    if (request.status !== 'APPROVED' || !request.expiresAt) {
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining());
    }, 60000);
    return () => clearInterval(interval);
  }, [request.status, request.expiresAt, calculateTimeRemaining]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const canModify =
    request.status === 'PENDING_APPROVAL' ||
    request.status === 'CHANGES_REQUESTED' ||
    request.status === 'REJECTED';

  // Can execute statements if request is approved or failed (for retry)
  const canExecuteStatements =
    isAdmin && (request.status === 'APPROVED' || request.status === 'FAILED');

  // Handle version comparison
  const handleCompareVersions = (leftVersionId: string, rightVersionId: string) => {
    const leftVersion = request.versions.find((v) => v.id === leftVersionId);
    const rightVersion = request.versions.find((v) => v.id === rightVersionId);

    if (leftVersion && rightVersion) {
      setCompareState({ leftVersion, rightVersion });
    }
  };

  const handleCloseCompare = () => {
    setCompareState(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{request.title}</h1>
            <StatusBadge status={request.status} size="md" />
          </div>
          {request.description && (
            <p className="mt-2 text-gray-600">{request.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <ExportButton requestIds={[request.id]} size="md" />
          {canModify && (
            <Link
              href={`/requests/${request.id}/edit`}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              修改
            </Link>
          )}
        </div>
      </div>

      {/* Expiration warning */}
      {request.status === 'APPROVED' && timeRemaining && (
        <div
          className={`rounded-md p-4 ${
            timeRemaining === 'Expired'
              ? 'border border-red-200 bg-red-50'
              : 'border border-yellow-200 bg-yellow-50'
          }`}
        >
          <div className="flex items-center">
            <svg
              className={`h-5 w-5 ${
                timeRemaining === 'Expired' ? 'text-red-400' : 'text-yellow-400'
              }`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <span
              className={`ml-2 text-sm font-medium ${
                timeRemaining === '已过期' ? 'text-red-800' : 'text-yellow-800'
              }`}
            >
              {timeRemaining === '已过期'
                ? '此审批已过期'
                : `审批${timeRemaining}后过期`}
            </span>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Request Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">请求信息</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">创建者</dt>
              <dd className="text-gray-900">
                {request.createdByDisplayName || request.createdByEmail}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">创建时间</dt>
              <dd className="text-gray-900">{formatDate(request.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">最后更新</dt>
              <dd className="text-gray-900">{formatDate(request.updatedAt)}</dd>
            </div>
            {request.expiresAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">过期时间</dt>
                <dd className="text-gray-900">{formatDate(request.expiresAt)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Target Info - Multi-target support */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">
            目标数据库
            {request.targets.length > 1 && (
              <span className="ml-2 text-gray-500">({request.targets.length})</span>
            )}
          </h3>
          {request.targets.length > 0 ? (
            <div className="space-y-3">
              {request.targets.map((target) => (
                <div
                  key={target.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {target.clusterDisplayName}
                      </span>
                      {target.clusterRegion && (
                        <span className="text-xs text-gray-500">
                          ({target.clusterRegion})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {target.targetDisplayName} · {target.dbType} / {target.code}
                    </div>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    {target.execStatus === 'SUCCEEDED' && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        ✓ 成功
                      </span>
                    )}
                    {target.execStatus === 'FAILED' && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        ✗ 失败
                      </span>
                    )}
                    {target.execStatus === 'EXECUTING' && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        执行中
                      </span>
                    )}
                    {target.execStatus === 'PENDING' && (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        待执行
                      </span>
                    )}
                    {!target.execStatus && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        未执行
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Fallback for legacy requests without targets in junction table
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">集群</dt>
                <dd className="text-gray-900">
                  {request.clusterName} ({request.clusterRegion})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">数据库</dt>
                <dd className="text-gray-900">{request.targetDisplayName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">类型</dt>
                <dd className="text-gray-900">{request.dbType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">角色</dt>
                <dd className="text-gray-900">{request.code}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* Execution Summary (if applicable) */}
      {selectedVersion && selectedVersion.statements.some((s) => s.execStatus) && (
        <ExecutionResultSummary statements={selectedVersion.statements} />
      )}

      {/* Main content area */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Version history sidebar */}
        <div className="lg:col-span-1">
          <VersionHistory
            versions={request.versions}
            selectedVersionId={selectedVersionId}
            onSelectVersion={setSelectedVersionId}
            onCompareVersions={handleCompareVersions}
          />
        </div>

        {/* Statements */}
        <div className="lg:col-span-3">
          {selectedVersion ? (
            <StatementList
              statements={selectedVersion.statements}
              canExecute={canExecuteStatements}
              isApprovedVersion={selectedVersion.id === request.approvedVersionId}
              targets={request.targets}
            />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
              选择一个版本查看语句
            </div>
          )}
        </div>
      </div>

      {/* Approval History */}
      <ApprovalHistory approvals={request.approvalHistory} />

      {/* Version Diff Modal */}
      {compareState && (
        <VersionDiff
          leftVersion={compareState.leftVersion}
          rightVersion={compareState.rightVersion}
          onClose={handleCloseCompare}
        />
      )}
    </div>
  );
}
