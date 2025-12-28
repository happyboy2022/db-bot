'use client';

import Link from 'next/link';
import { Plus, Inbox, FileText } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { RequestActions } from './request-actions';
import { Pagination } from '@/components/shared/pagination';
import type { RequestListItem, PaginatedResult } from '@/lib/queries/requests';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface RequestListProps {
  requests: PaginatedResult<RequestListItem>;
  isAdmin?: boolean;
}

export function RequestList({ requests, isAdmin = false }: RequestListProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  if (requests.items.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
        <div className="rounded-full bg-muted/50 p-3">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">暂无请求</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
          创建一个新的 SQL 请求开始使用。
        </p>
        <Button asChild>
          <Link href="/requests/new">
            <Plus className="mr-2 h-4 w-4" />
            新建请求
          </Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>目标数据库</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>版本</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.items.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/requests/${request.id}`}
                    className="flex items-center space-x-2 text-blue-600 hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    <span>{request.title}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{request.clusterName}</span>
                    <span className="text-xs text-muted-foreground">
                      {request.targetDisplayName} ({request.code})
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {request.hasWriteOperations ? (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-amber-200">
                      写操作
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50/80 border-blue-200">
                      只读
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{formatDate(request.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      提交者: {request.createdByDisplayName || request.createdByEmail}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  v{request.currentVersion}
                </TableCell>
                <TableCell>
                  <RequestActions
                    requestId={request.id}
                    versionId={request.currentVersionId}
                    approvedVersionId={request.approvedVersionId}
                    status={request.status}
                    isAdmin={isAdmin}
                    hasWriteOperations={request.hasWriteOperations}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={requests.page}
        totalPages={requests.totalPages}
        totalItems={requests.total}
        pageSize={requests.pageSize}
      />
    </div>
  );
}
