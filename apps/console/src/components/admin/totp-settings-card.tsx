'use client';

import { useState, useTransition } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { updateTotpEnabled } from '@/app/(dashboard)/admin/settings/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TotpSettingsCardProps {
  totpEnabled: boolean;
}

export function TotpSettingsCard({ totpEnabled }: TotpSettingsCardProps) {
  const [isPending, startTransition] = useTransition();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingValue, setPendingValue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (enabled: boolean) => {
    setPendingValue(enabled);
    setShowConfirmDialog(true);
  };

  const confirmToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateTotpEnabled(pendingValue);
      if (!result.success) {
        setError(result.error || '操作失败');
      }
      setShowConfirmDialog(false);
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <CardTitle>双因素认证 (TOTP)</CardTitle>
          </div>
          <CardDescription>
            启用后，所有用户登录时都需要输入一次性密码。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">当前状态：</span>
                {totpEnabled ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    已启用
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                    已禁用
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {totpEnabled
                  ? '所有用户必须使用双因素认证才能登录系统。'
                  : '用户可以直接使用密码登录，无需双因素认证。'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {error && <span className="text-sm text-red-600">{error}</span>}
              {totpEnabled ? (
                <Button
                  variant="outline"
                  onClick={() => handleToggle(false)}
                  disabled={isPending}
                >
                  禁用 TOTP
                </Button>
              ) : (
                <Button onClick={() => handleToggle(true)} disabled={isPending}>
                  启用 TOTP
                </Button>
              )}
            </div>
          </div>

          {totpEnabled && (
            <div className="mt-4 rounded-lg bg-amber-50 p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">注意事项</h3>
                  <div className="mt-2 text-sm text-amber-700">
                    <ul className="list-disc space-y-1 pl-5">
                      <li>所有用户（包括管理员）都必须使用 TOTP 登录</li>
                      <li>新创建的用户会自动生成 TOTP 密钥</li>
                      <li>用户可以在登录后自行重置 TOTP</li>
                      <li>请确保用户已设置好身份验证器应用</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingValue ? '启用双因素认证' : '禁用双因素认证'}
            </DialogTitle>
            <DialogDescription>
              {pendingValue
                ? '启用后，所有用户登录时都需要输入一次性密码。确定要启用吗？'
                : '禁用后，用户可以直接使用密码登录。这会降低系统安全性，确定要禁用吗？'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button
              onClick={confirmToggle}
              disabled={isPending}
              variant={pendingValue ? 'default' : 'destructive'}
            >
              {isPending ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
