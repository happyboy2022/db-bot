'use client';

import { useState } from 'react';
import { Copy, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UserCredentialsModalProps {
  credentials: {
    email: string;
    password: string;
    totpSecret: string;
    totpQrCode: string;
    recoveryCodes: string[];
  };
  onClose: () => void;
}

export function UserCredentialsModal({ credentials, onClose }: UserCredentialsModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyAll = async () => {
    const allInfo = `用户凭据信息
==================
邮箱: ${credentials.email}
密码: ${credentials.password}
TOTP 密钥: ${credentials.totpSecret}

恢复码（每个只能使用一次）:
${credentials.recoveryCodes.join('\n')}
==================
请妥善保管以上信息`;

    await copyToClipboard(allInfo, 'all');
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>用户创建成功</DialogTitle>
          <DialogDescription>
            请将以下凭据信息发送给用户，此信息仅显示一次。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Warning */}
          <div className="rounded-lg bg-amber-50 p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-amber-800">
                  重要提示
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  此信息仅显示一次，关闭后将无法再次查看密码。请确保已复制或截图保存。
                </p>
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">邮箱</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 px-3 py-2 font-mono text-sm">
                {credentials.email}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(credentials.email, 'email')}
              >
                {copiedField === 'email' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">初始密码</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 px-3 py-2 font-mono text-sm">
                {showPassword ? credentials.password : '••••••••••••••••'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(credentials.password, 'password')}
              >
                {copiedField === 'password' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* TOTP QR Code */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">TOTP 二维码</label>
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <img
                src={credentials.totpQrCode}
                alt="TOTP QR Code"
                className="h-48 w-48"
              />
            </div>
            <p className="text-center text-xs text-gray-500">
              使用身份验证器应用（如 Google Authenticator）扫描此二维码
            </p>
          </div>

          {/* TOTP Secret */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">TOTP 密钥（手动输入）</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 px-3 py-2 font-mono text-sm break-all">
                {showSecret ? credentials.totpSecret : '••••••••••••••••••••••••••••••••'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(credentials.totpSecret, 'secret')}
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
            <label className="text-sm font-medium text-gray-700">恢复码（每个只能使用一次）</label>
            <div className="grid grid-cols-2 gap-2">
              {credentials.recoveryCodes.map((code, index) => (
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
                copyToClipboard(credentials.recoveryCodes.join('\n'), 'recoveryCodes')
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
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={copyAll} className="flex-1">
            {copiedField === 'all' ? (
              <>
                <Check className="mr-2 h-4 w-4 text-green-600" />
                已复制全部
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                复制全部信息
              </>
            )}
          </Button>
          <Button onClick={onClose} className="flex-1">
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
