'use client';

import { useState, useTransition } from 'react';
import { KeyRound } from 'lucide-react';
import type { UserProfile } from '@/lib/queries/users';
import {
  activateUser,
  suspendUser,
  restoreUser,
  changeUserRole,
} from '@/app/(dashboard)/admin/users/actions';
import { UserTotpModal } from './user-totp-modal';

interface UserActionsProps {
  user: UserProfile;
}

export function UserActions({ user }: UserActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{
    type: 'activate' | 'suspend' | 'restore' | 'role';
    role?: 'USER' | 'ADMIN';
  } | null>(null);

  const handleAction = (
    type: 'activate' | 'suspend' | 'restore' | 'role',
    role?: 'USER' | 'ADMIN'
  ) => {
    setError(null);
    setShowConfirmDialog({ type, role });
    setShowRoleMenu(false);
  };

  const confirmAction = () => {
    if (!showConfirmDialog) return;

    startTransition(async () => {
      let result;
      switch (showConfirmDialog.type) {
        case 'activate':
          result = await activateUser(user.id);
          break;
        case 'suspend':
          result = await suspendUser(user.id);
          break;
        case 'restore':
          result = await restoreUser(user.id);
          break;
        case 'role':
          if (showConfirmDialog.role) {
            result = await changeUserRole(user.id, showConfirmDialog.role);
          }
          break;
      }

      if (result && !result.success) {
        setError(result.error || '操作失败');
      }
      setShowConfirmDialog(null);
    });
  };

  const getConfirmDialogMessage = () => {
    if (!showConfirmDialog) return '';
    switch (showConfirmDialog.type) {
      case 'activate':
        return `确定要激活用户 "${user.email}" 吗？这将授予其普通用户访问权限。`;
      case 'suspend':
        return `确定要停用用户 "${user.email}" 吗？该用户将无法访问系统。`;
      case 'restore':
        return `确定要恢复用户 "${user.email}" 吗？该用户将重新获得系统访问权限。`;
      case 'role':
        return `确定要将 "${user.email}" 的角色更改为 ${showConfirmDialog.role === 'ADMIN' ? '管理员' : '普通用户'} 吗？`;
      default:
        return '';
    }
  };

  return (
    <div className="relative flex items-center justify-end gap-2">
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}

      {/* Action buttons based on user state */}
      {user.role === 'PENDING' && (
        <button
          onClick={() => handleAction('activate')}
          disabled={isPending}
          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          激活
        </button>
      )}

      {user.role !== 'PENDING' && user.status === 'ACTIVE' && (
        <button
          onClick={() => handleAction('suspend')}
          disabled={isPending}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          停用
        </button>
      )}

      {user.status === 'SUSPENDED' && (
        <button
          onClick={() => handleAction('restore')}
          disabled={isPending}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          恢复
        </button>
      )}

      {/* Role change dropdown */}
      {user.role !== 'PENDING' && (
        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            disabled={isPending}
            className="rounded-md border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            更改角色
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border bg-white shadow-lg">
              {user.role !== 'USER' && (
                <button
                  onClick={() => handleAction('role', 'USER')}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  设为普通用户
                </button>
              )}
              {user.role !== 'ADMIN' && (
                <button
                  onClick={() => handleAction('role', 'ADMIN')}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  设为管理员
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TOTP Management button */}
      {user.role !== 'PENDING' && (
        <button
          onClick={() => setShowTotpModal(true)}
          disabled={isPending}
          className="rounded-md border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="管理 TOTP"
        >
          <KeyRound className="h-4 w-4" />
        </button>
      )}

      {/* TOTP Modal */}
      <UserTotpModal
        userId={user.id}
        userEmail={user.email}
        open={showTotpModal}
        onClose={() => setShowTotpModal(false)}
      />

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              确认操作
            </h3>
            <p className="mb-6 text-sm text-gray-600">
              {getConfirmDialogMessage()}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDialog(null)}
                disabled={isPending}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmAction}
                disabled={isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
