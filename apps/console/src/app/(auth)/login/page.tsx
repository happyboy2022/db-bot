'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { login, verifyTotp, verifyRecoveryCodeAction, type LoginResult } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

const REMEMBER_EMAIL_KEY = 'sql_ops_remember_email';

type LoginStep = 'credentials' | 'totp' | 'recovery';

function getInitialState() {
  if (typeof window === 'undefined') {
    return { email: '', rememberMe: false, shouldFocusPassword: false };
  }
  const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
  if (savedEmail) {
    return { email: savedEmail, rememberMe: true, shouldFocusPassword: true };
  }
  return { email: '', rememberMe: false, shouldFocusPassword: false };
}

export default function LoginPage() {
  const initialState = getInitialState();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(initialState.rememberMe);
  const [email, setEmail] = useState(initialState.email);
  const [tempToken, setTempToken] = useState<string>('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const totpInputRef = useRef<HTMLInputElement>(null);

  // Focus password input if email is remembered
  useEffect(() => {
    if (initialState.shouldFocusPassword) {
      passwordInputRef.current?.focus();
    }
  }, [initialState.shouldFocusPassword]);

  // Focus TOTP input when entering TOTP step
  useEffect(() => {
    if (step === 'totp') {
      totpInputRef.current?.focus();
    }
  }, [step]);

  async function handleCredentialsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get('email') as string;

    // Handle remember me
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, emailValue);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    const result = await login(formData) as LoginResult | void;

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result?.requireTotp) {
      setTempToken(result.tempToken || '');
      setEmail(result.email || emailValue);
      setStep('totp');
      setLoading(false);
      return;
    }

    // Login successful (will redirect)
    setLoading(false);
  }

  async function handleTotpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await verifyTotp(tempToken, totpCode, email);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Login successful (will redirect)
    setLoading(false);
  }

  async function handleRecoverySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await verifyRecoveryCodeAction(tempToken, recoveryCode, email);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Login successful (will redirect)
    setLoading(false);
  }

  function handleBackToCredentials() {
    setStep('credentials');
    setTempToken('');
    setTotpCode('');
    setRecoveryCode('');
    setError(null);
  }

  function handleSwitchToRecovery() {
    setStep('recovery');
    setError(null);
    setTotpCode('');
  }

  function handleSwitchToTotp() {
    setStep('totp');
    setError(null);
    setRecoveryCode('');
  }

  // Credentials Step
  if (step === 'credentials') {
    return (
      <div>
        <h1 className="mb-2 text-center text-2xl font-bold">登录</h1>
        <p className="mb-6 text-center text-sm text-gray-600">
          输入您的邮箱和密码登录账户
        </p>

        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              邮箱
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="m@example.com"
              required
              autoComplete="email"
              className="mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              密码
            </label>
            <Input
              ref={passwordInputRef}
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1"
              disabled={loading}
            />
          </div>
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                name="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                disabled={loading}
              />
              <Label
                htmlFor="remember"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                记住邮箱
              </Label>
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                登录中...
              </>
            ) : (
              '登录'
            )}
          </Button>
        </form>
      </div>
    );
  }

  // TOTP Step
  if (step === 'totp') {
    return (
      <div>
        <button
          onClick={handleBackToCredentials}
          className="mb-4 flex items-center text-sm text-gray-600 hover:text-gray-900"
          disabled={loading}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </button>

        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <KeyRound className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-center text-2xl font-bold">双因素认证</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            请输入身份验证器应用中显示的 6 位验证码
          </p>
        </div>

        <form onSubmit={handleTotpSubmit} className="space-y-4">
          <div>
            <label htmlFor="totp" className="block text-sm font-medium text-gray-700">
              验证码
            </label>
            <Input
              ref={totpInputRef}
              id="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              required
              autoComplete="one-time-code"
              className="mt-1 text-center text-2xl tracking-widest"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading || totpCode.length !== 6}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                验证中...
              </>
            ) : (
              '验证'
            )}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={handleSwitchToRecovery}
            className="text-sm text-blue-600 hover:underline"
            disabled={loading}
          >
            使用恢复码
          </button>
        </div>
      </div>
    );
  }

  // Recovery Code Step
  return (
    <div>
      <button
        onClick={handleSwitchToTotp}
        className="mb-4 flex items-center text-sm text-gray-600 hover:text-gray-900"
        disabled={loading}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        返回验证码
      </button>

      <div className="mb-6 flex flex-col items-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <KeyRound className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-center text-2xl font-bold">使用恢复码</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          请输入您保存的恢复码（每个恢复码只能使用一次）
        </p>
      </div>

      <form onSubmit={handleRecoverySubmit} className="space-y-4">
        <div>
          <label htmlFor="recovery" className="block text-sm font-medium text-gray-700">
            恢复码
          </label>
          <Input
            id="recovery"
            type="text"
            placeholder="XXXX-XXXX"
            required
            autoComplete="off"
            className="mt-1 text-center text-xl tracking-wide uppercase"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            disabled={loading}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={loading || recoveryCode.length < 8}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              验证中...
            </>
          ) : (
            '验证恢复码'
          )}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={handleBackToCredentials}
          className="text-sm text-gray-600 hover:underline"
          disabled={loading}
        >
          重新输入邮箱和密码
        </button>
      </div>
    </div>
  );
}
