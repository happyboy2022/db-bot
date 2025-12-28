'use client';

import { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  getUserTotpInfo,
  resetUserTotp,
} from '@/app/(dashboard)/admin/users/actions';

interface UserTotpModalProps {
  userId: string;
  userEmail: string;
  open: boolean;
  onClose: () => void;
}

interface TotpData {
  email: string;
  totpSecret: string | null;
  totpQrCode: string | null;
  recoveryCodes: string[];
  remainingRecoveryCodes: number;
}

export function UserTotpModal({ userId, userEmail, open, onClose }: UserTotpModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpData, setTotpData] = useState<TotpData | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetData, setResetData] = useState<{
    email: string;
    totpSecret: string;
    totpQrCode: string;
    recoveryCodes: string[];
  } | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // 加载用户 TOTP 信息
  const loadTotpInfo = async () => {
    setLoading(true);
    setError(null);

    const result = await getUserTotpInfo(userId);
    if (result.success && result.data) {
      setTotpData(result.data);
    } else {
      setError(result.error || '获取 TOTP 信息失败');
    }

    setLoading(false);
  };

  // 重置用户 TOTP
  const handleResetTotp = async () => {
    setLoading(true);
    setError(null);

    const result = await resetUserTotp(userId);
    if (result.success && result.data) {
      setResetData(result.data);
      setShowResetConfirm(false);
    } else {
      setError(result.error || '重置 TOTP 失败');
    }

    setLoading(false);
  };

  // 首次打开时加载数据
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && !totpData && !loading) {
      loadTotpInfo();
    }
    if (!isOpen) {
      // 关闭时重置状态
      setTotpData(null);
      setResetData(null);
      setError(null);
      setShowSecret(false);
      setShowResetConfirm(false);
      onClose();
    }
  };

  const copyAll = async () => {
    if (!resetData) return;
    const allInfo = `用户 TOTP 凭据
==================
邮箱: ${resetData.email}
TOTP 密钥: ${resetData.totpSecret}

恢复码（每个只能使用一次）:
${resetData.recoveryCodes.join('\n')}
==================
请将以上信息发送给用户`;

    await copyToClipboard(allInfo, 'all');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            用户 TOTP 管理
          </DialogTitle>
          <DialogDescription>
            查看和管理用户 {userEmail} 的双因素认证信息
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading && !totpData && !resetData && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 重置后显示新凭据 */}
          {resetData && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  TOTP 已重置。请将以下信息发送给用户，此信息仅显示一次。
                </AlertDescription>
              </Alert>

              {/* QR Code */}
              <div className="space-y-2">
                <label className="text-sm font-medium">TOTP 二维码</label>
                <div className="flex justify-center rounded-lg border bg-white p-4">
                  <img
                    src={resetData.totpQrCode}
                    alt="TOTP QR Code"
                    className="h-48 w-48"
                  />
                </div>
              </div>

              {/* Secret */}
              <div className="space-y-2">
                <label className="text-sm font-medium">TOTP 密钥</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-gray-100 px-3 py-2 font-mono text-sm break-all">
                    {showSecret ? resetData.totpSecret : '••••••••••••••••••••••••••••••••'}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(resetData.totpSecret, 'secret')}
                  >
                    {copiedField === 'secret' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Recovery Codes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">恢复码</label>
                <div className="grid grid-cols-2 gap-2">
                  {resetData.recoveryCodes.map((code, index) => (
                    <code
                      key={index}
                      className="rounded bg-gray-100 px-3 py-2 text-center font-mono text-sm"
                    >
                      {code}
                    </code>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    copyToClipboard(resetData.recoveryCodes.join('\n'), 'recoveryCodes')
                  }
                >
                  {copiedField === 'recoveryCodes' ? (
                    <>
                      <Check className="mr-2 h-4 w-4 text-green-600" />
                      已复制恢复码
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      复制所有恢复码
                    </>
                  )}
                </Button>
              </div>

              <Button className="w-full" onClick={copyAll}>
                {copiedField === 'all' ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    已复制全部信息
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    复制全部信息
                  </>
                )}
              </Button>
            </div>
          )}

          {/* 显示当前 TOTP 信息 */}
          {totpData && !resetData && (
            <div className="space-y-4">
              {/* TOTP 状态 */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <KeyRound className={`h-5 w-5 ${totpData.totpSecret ? 'text-green-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="font-medium">
                      TOTP 状态：{totpData.totpSecret ? '已设置' : '未设置'}
                    </p>
                    {totpData.totpSecret && (
                      <p className="text-sm text-muted-foreground">
                        剩余恢复码：{totpData.remainingRecoveryCodes} 个
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 当前 QR Code（如果有） */}
              {totpData.totpQrCode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">当前 TOTP 二维码</label>
                  <div className="flex justify-center rounded-lg border bg-white p-4">
                    <img
                      src={totpData.totpQrCode}
                      alt="TOTP QR Code"
                      className="h-40 w-40"
                    />
                  </div>
                </div>
              )}

              {/* 当前密钥 */}
              {totpData.totpSecret && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">当前 TOTP 密钥</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-gray-100 px-3 py-2 font-mono text-sm break-all">
                      {showSecret ? totpData.totpSecret : '••••••••••••••••••••••••••••••••'}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(totpData.totpSecret!, 'currentSecret')}
                    >
                      {copiedField === 'currentSecret' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* 重置确认 */}
              {showResetConfirm ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>确定要重置该用户的 TOTP 吗？这将使旧配置失效。</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResetConfirm(false)}
                        disabled={loading}
                      >
                        取消
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleResetTotp}
                        disabled={loading}
                      >
                        {loading ? '重置中...' : '确认重置'}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={loading}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重置用户 TOTP
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {resetData ? '完成' : '关闭'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
