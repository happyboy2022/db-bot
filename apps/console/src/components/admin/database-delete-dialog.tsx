'use client';

import type { DatabaseListItem } from '@/lib/queries/databases';
import { ConfirmDeleteDialog } from '@/components/shared/confirm-delete-dialog';

interface DatabaseDeleteDialogProps {
  database: DatabaseListItem;
  isPending: boolean;
  onConfirm: (confirmationCode: string) => void;
  onCancel: () => void;
}

export function DatabaseDeleteDialog({
  database,
  isPending,
  onConfirm,
  onCancel,
}: DatabaseDeleteDialogProps) {
  return (
    <ConfirmDeleteDialog
      title="删除数据库"
      description={
        <>
          此操作将永久删除数据库{' '}
          <span className="font-semibold">&quot;{database.displayName}&quot;</span>{' '}
          及其相关配置。
        </>
      }
      warningText="此操作无法撤销。删除后，与该数据库相关的配置将无法恢复。"
      confirmationCode={database.code}
      confirmationLabel="数据库代号"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
