'use client';

import type { ClusterListItem } from '@/lib/queries/clusters';
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog';

interface ClusterDeleteDialogProps {
  cluster: ClusterListItem;
  isPending: boolean;
  onConfirm: (confirmationCode: string) => void;
  onCancel: () => void;
}

export function ClusterDeleteDialog({
  cluster,
  isPending,
  onConfirm,
  onCancel,
}: ClusterDeleteDialogProps) {
  return (
    <ConfirmDeleteDialog
      title="删除集群"
      description={
        <>
          此操作将永久删除集群{' '}
          <span className="font-semibold">&quot;{cluster.displayName}&quot;</span>{' '}
          及其相关配置。
        </>
      }
      warningText="此操作无法撤销。删除后，与该集群相关的所有数据将无法恢复。"
      confirmationCode={cluster.name}
      confirmationLabel="集群代号"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
