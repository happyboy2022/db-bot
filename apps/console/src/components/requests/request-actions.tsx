'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Edit2, RotateCcw, Copy, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { approveRequest, rejectRequest, requestChanges } from '@/app/(dashboard)/admin/approvals/actions';
import { retryExecution } from '@/app/(dashboard)/requests/actions';
import type { RequestStatus } from '@/lib/queries/requests';

interface RequestActionsProps {
  requestId: string;
  versionId: string | null;
  approvedVersionId?: string | null;
  status: RequestStatus;
  isAdmin: boolean;
  hasWriteOperations?: boolean;
}

type DialogType = 'approve' | 'reject' | 'changes' | 'retry' | null;

export function RequestActions({
  requestId,
  versionId,
  approvedVersionId,
  status,
  isAdmin,
  hasWriteOperations = false,
}: RequestActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 管理员可以审批待审批的请求
  const canApprove = isAdmin && status === 'PENDING_APPROVAL';
  // 管理员可以拒绝待审批或已审批的请求
  const canReject = isAdmin && (status === 'PENDING_APPROVAL' || status === 'APPROVED');
  const canRetry = isAdmin && status === 'FAILED';
  const canCopy = true; // All users can copy requests

  // 根据状态获取用于拒绝操作的 versionId
  const rejectVersionId = status === 'APPROVED' ? approvedVersionId : versionId;

  if (!canApprove && !canReject && !canRetry && !canCopy) {
    return null;
  }

  const handleAction = async () => {
    setError(null);

    // 拒绝操作需要使用对应的 versionId
    const actionVersionId = dialogType === 'reject' ? rejectVersionId : versionId;

    if (!actionVersionId) {
      setError('无效的请求版本');
      return;
    }

    startTransition(async () => {
      let result;

      switch (dialogType) {
        case 'approve':
          result = await approveRequest(requestId, actionVersionId);
          break;
        case 'reject':
          if (!comment.trim()) {
            setError('请提供拒绝理由');
            return;
          }
          result = await rejectRequest(requestId, actionVersionId, comment);
          break;
        case 'changes':
          if (!comment.trim()) {
            setError('请提供反馈意见');
            return;
          }
          result = await requestChanges(requestId, actionVersionId, comment);
          break;
        case 'retry':
          result = await retryExecution(requestId, actionVersionId);
          break;
        default:
          return;
      }

      if (result.success) {
        setDialogType(null);
        setComment('');
        router.refresh();
      } else {
        setError(result.error || '操作失败');
      }
    });
  };

  // Handle copy - navigate to new request page with copyFrom parameter
  const handleCopy = () => {
    router.push(`/requests/new?copyFrom=${requestId}`);
  };

  const closeDialog = () => {
    setDialogType(null);
    setComment('');
    setError(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">操作</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canApprove && (
            <>
              <DropdownMenuItem onClick={() => setDialogType('approve')}>
                <Check className="mr-2 h-4 w-4 text-green-600" />
                批准
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialogType('changes')}>
                <Edit2 className="mr-2 h-4 w-4 text-orange-600" />
                要求修改
              </DropdownMenuItem>
            </>
          )}
          {canReject && (
            <>
              <DropdownMenuItem onClick={() => setDialogType('reject')}>
                <X className="mr-2 h-4 w-4 text-red-600" />
                {status === 'APPROVED' ? '撤回批准' : '拒绝'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canRetry && (
            <>
              <DropdownMenuItem onClick={() => setDialogType('retry')}>
                <RotateCcw className="mr-2 h-4 w-4 text-blue-600" />
                重新执行
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            复制为草稿
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Approve Dialog */}
      <Dialog open={dialogType === 'approve'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批准请求</DialogTitle>
            <DialogDescription>
              这将批准该 SQL 请求，允许在 24 小时内执行。
            </DialogDescription>
          </DialogHeader>
          {hasWriteOperations && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>注意：</strong>此请求包含写操作（UPDATE/DELETE）。
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleAction} disabled={isPending} className="bg-green-600 hover:bg-green-500">
              {isPending ? '处理中...' : '批准'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={dialogType === 'reject'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{status === 'APPROVED' ? '撤回批准' : '拒绝请求'}</DialogTitle>
            <DialogDescription>
              {status === 'APPROVED'
                ? '这将撤回已批准的 SQL 请求，该请求将无法再执行。请提供撤回理由。'
                : '这将永久拒绝该 SQL 请求。请提供拒绝理由。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              {status === 'APPROVED' ? '撤回理由' : '拒绝理由'} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={status === 'APPROVED' ? '请说明撤回批准的原因...' : '请说明拒绝此请求的原因...'}
              rows={3}
            />
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleAction} disabled={isPending} variant="destructive">
              {isPending ? '处理中...' : status === 'APPROVED' ? '撤回批准' : '拒绝'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Dialog */}
      <Dialog open={dialogType === 'changes'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>要求修改</DialogTitle>
            <DialogDescription>
              要求提交者修改请求。请提供反馈意见。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="feedback">
              反馈意见 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="feedback"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="请描述需要修改的内容..."
              rows={3}
            />
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleAction} disabled={isPending} className="bg-orange-600 hover:bg-orange-500">
              {isPending ? '处理中...' : '要求修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry Dialog */}
      <Dialog open={dialogType === 'retry'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重新执行</DialogTitle>
            <DialogDescription>
              这将重新提交请求以执行。之前的执行已失败，将重新尝试执行同一个 SQL。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleAction} disabled={isPending}>
              {isPending ? '处理中...' : '重新执行'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
