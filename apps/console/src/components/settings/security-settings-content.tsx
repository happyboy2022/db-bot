'use client';

import { useState } from 'react';
import { Shield, ShieldCheck, ShieldOff, KeyRound, RefreshCw, Copy, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';
import {
  initiateTotpReset,
  confirmTotpReset,
  regenerateRecoveryCodes,
  type SecurityStatus,
  type TotpResetResult,
} from '@/app/(dashboard)/settings/security/actions';

interface SecuritySettingsContentProps {
  status: SecurityStatus;
}

export function SecuritySettingsContent({ status }: SecuritySettingsContentProps) {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isRecoveryDialogOpen, setIsRecoveryDialogOpen] = useState(false);
  const [resetData, setResetData] = useState<TotpResetResult | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // 开始重置 TOTP
  const handleStartReset = async () => {
    setLoading(true);
    setError(null);

    const result = await initiateTotpReset();
    if (result.success) {
      setResetData(result);
      setIsResetDialogOpen(true);
    } else {
      setError(result.error || '操作失败');
    }

    setLoading(false);
  };

  // 确认重置 TOTP
  const handleConfirmReset = async () => {
    if (!resetData?.totpSecret || !resetData?.recoveryCodes) return;

    setLoading(true);
    setError(null);

    const result = await confirmTotpReset(
      resetData.totpSecret,
      resetData.recoveryCodes,
      verificationCode
    );

    if (result.success) {
      setIsResetDialogOpen(false);
      setResetData(null);
      setVerificationCode('');
      // 刷新页面以显示新状态
      window.location.reload();
    } else {
      setError(result.error || '验证失败');
    }

    setLoading(false);
  };

  // 重新生成恢复码
  const handleRegenerateRecoveryCodes = async () => {
    setLoading(true);
    setError(null);

    const result = await regenerateRecoveryCodes();
    if (result.success && result.recoveryCodes) {
      setNewRecoveryCodes(result.recoveryCodes);
      setIsRecoveryDialogOpen(true);
    } else {
      setError(result.error || '操作失败');
    }

    setLoading(false);
  };

  const closeResetDialog = () => {
    setIsResetDialogOpen(false);
    setResetData(null);
    setVerificationCode('');
    setError(null);
    setShowSecret(false);
  };

  const closeRecoveryDialog = () => {
    setIsRecoveryDialogOpen(false);
    setNewRecoveryCodes(null);
  };

  return (
    <div className="space-y-6">
      {/* TOTP 状态卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <CardTitle>双因素认证 (TOTP)</CardTitle>
          </div>
          <CardDescription>
            使用身份验证器应用（如 Google Authenticator）生成一次性验证码，增强账户安全性。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 全局状态 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {status.totpGloballyEnabled ? (
                <ShieldCheck className="h-5 w-5 text-green-600" />
              ) : (
                <ShieldOff className="h-5 w-5 text-gray-400" />
              )}
              <div>
                <p className="font-medium">
                  系统双因素认证：{status.totpGloballyEnabled ? '已启用' : '未启用'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {status.totpGloballyEnabled
                    ? '所有用户登录时需要输入验证码'
                    : '管理员尚未启用全局双因素认证'}
                </p>
              </div>
            </div>
          </div>

          {/* 用户 TOTP 状态 */}
          {status.totpGloballyEnabled && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <KeyRound className={`h-5 w-5 ${status.userHasTotp ? 'text-green-600' : 'text-amber-500'}`} />
                <div>
                  <p className="font-medium">
                    您的双因素认证：{status.userHasTotp ? '已设置' : '未设置'}
                  </p>
                  {status.userHasTotp && status.totpEnabledAt && (
                    <p className="text-sm text-muted-foreground">
                      设置于 {new Date(status.totpEnabledAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant={status.userHasTotp ? 'outline' : 'default'}
                onClick={handleStartReset}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {status.userHasTotp ? '重置 TOTP' : '设置 TOTP'}
              </Button>
            </div>
          )}

          {/* 恢复码状态 */}
          {status.totpGloballyEnabled && status.userHasTotp && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <KeyRound className={`h-5 w-5 ${status.remainingRecoveryCodes > 2 ? 'text-green-600' : 'text-amber-500'}`} />
                <div>
                  <p className="font-medium">恢复码</p>
                  <p className="text-sm text-muted-foreground">
                    剩余可用恢复码：{status.remainingRecoveryCodes} 个
                    {status.remainingRecoveryCodes <= 2 && (
                      <span className="ml-2 text-amber-600">（建议重新生成）</span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleRegenerateRecoveryCodes}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                重新生成
              </Button>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 重置 TOTP 对话框 */}
      <Dialog open={isResetDialogOpen} onOpenChange={(open) => !open && closeResetDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{status.userHasTotp ? '重置双因素认证' : '设置双因素认证'}</DialogTitle>
            <DialogDescription>
              使用身份验证器应用扫描二维码或手动输入密钥，然后输入验证码确认。
            </DialogDescription>
          </DialogHeader>

          {resetData && (
            <div className="space-y-6 py-4">
              {/* 警告 */}
              {status.userHasTotp && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    重置后，旧的 TOTP 配置将失效。请确保在新设备上完成配置后再确认。
                  </AlertDescription>
                </Alert>
              )}

              {/* QR Code */}
              <div className="space-y-2">
                <label className="text-sm font-medium">扫描二维码</label>
                <div className="flex justify-center rounded-lg border bg-white p-4">
                  <img
                    src={resetData.totpQrCode}
                    alt="TOTP QR Code"
                    className="h-48 w-48"
                  />
                </div>
                <p className="text-center text-xs text-gray-500">
                  使用身份验证器应用扫描此二维码
                </p>
              </div>

              {/* 手动密钥 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">或手动输入密钥</label>
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
                    onClick={() => copyToClipboard(resetData.totpSecret!, 'secret')}
                  >
                    {copiedField === 'secret' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* 恢复码 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">恢复码（请妥善保存）</label>
                <div className="grid grid-cols-2 gap-2">
                  {resetData.recoveryCodes?.map((code, index) => (
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
                    copyToClipboard(resetData.recoveryCodes!.join('\n'), 'recoveryCodes')
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

              {/* 验证码输入 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">输入验证码确认</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">
                  请输入身份验证器应用中显示的 6 位验证码
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeResetDialog} disabled={loading}>
              取消
            </Button>
            <Button
              onClick={handleConfirmReset}
              disabled={loading || verificationCode.length !== 6}
            >
              {loading ? '验证中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重新生成恢复码对话框 */}
      <Dialog open={isRecoveryDialogOpen} onOpenChange={(open) => !open && closeRecoveryDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新的恢复码</DialogTitle>
            <DialogDescription>
              请妥善保存以下恢复码，每个恢复码只能使用一次。旧的恢复码已失效。
            </DialogDescription>
          </DialogHeader>

          {newRecoveryCodes && (
            <div className="space-y-4 py-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  此信息仅显示一次，关闭后将无法再次查看。请确保已复制或截图保存。
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-2">
                {newRecoveryCodes.map((code, index) => (
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
                className="w-full"
                onClick={() => copyToClipboard(newRecoveryCodes.join('\n'), 'newRecoveryCodes')}
              >
                {copiedField === 'newRecoveryCodes' ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-600" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    复制所有恢复码
                  </>
                )}
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button onClick={closeRecoveryDialog}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
