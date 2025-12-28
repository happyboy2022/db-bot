import type { RequestStatus } from '@/lib/queries/requests';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: RequestStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  RequestStatus,
  { label: string; className: string }
> = {
  PENDING_APPROVAL: {
    label: '待审批',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80 border-transparent',
  },
  CHANGES_REQUESTED: {
    label: '需修改',
    className: 'bg-orange-100 text-orange-800 hover:bg-orange-100/80 border-transparent',
  },
  REJECTED: {
    label: '已拒绝',
    className: 'bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent',
  },
  APPROVED: {
    label: '已批准',
    className: 'bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent',
  },
  APPROVAL_EXPIRED: {
    label: '已过期',
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-100/80 border-transparent',
  },
  EXECUTING: {
    label: '执行中',
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent',
  },
  SUCCEEDED: {
    label: '执行成功',
    className: 'bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent',
  },
  FAILED: {
    label: '执行失败',
    className: 'bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent',
  },
  TERMINATED: {
    label: '已终止',
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-100/80 border-transparent',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  
  return (
    <Badge
      variant="outline"
      className={cn(
        config.className,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      )}
    >
      {config.label}
    </Badge>
  );
}
