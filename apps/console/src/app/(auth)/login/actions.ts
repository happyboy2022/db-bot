'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { profiles, totpVerifications } from '@/db/schema';
import { auth } from '@/lib/auth-config';
import { isTotpEnabled } from '@/lib/queries/system-settings';
import {
  generateVerificationToken,
  verifyTotpCode,
  verifyRecoveryCode,
  markRecoveryCodeUsed,
  encryptPassword,
  decryptPassword,
} from '@/lib/totp';
import { eq, and, gt } from 'drizzle-orm';

export interface LoginResult {
  error?: string;
  requireTotp?: boolean;
  tempToken?: string;
  email?: string;
}

/**
 * Step 1: Validate email and password
 * Returns tempToken if TOTP is required, or completes login if not
 */
export async function login(formData: FormData): Promise<LoginResult | void> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: '请输入邮箱和密码' };
  }

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // Check if TOTP is globally enabled
  const totpGloballyEnabled = await isTotpEnabled();

  if (!totpGloballyEnabled) {
    // TOTP not enabled, proceed with normal login
    try {
      const result = await auth.api.signInEmail({
        body: { email, password },
        headers: headersList,
      });

      if (!result || 'error' in result) {
        const errorObj = result as { error?: { message?: string } } | null;
        const errorMsg = errorObj?.error?.message || '登录失败，请检查邮箱和密码';
        return { error: errorMsg };
      }
    } catch (err) {
      return { error: parseAuthError(err) };
    }

    redirect('/requests');
  }

  // TOTP is enabled - validate password first
  try {
    // Try to sign in to verify credentials
    const signInResult = await auth.api.signInEmail({
      body: { email, password },
      headers: headersList,
    });

    if (!signInResult || 'error' in signInResult) {
      const errorObj = signInResult as { error?: { message?: string } } | null;
      const errorMsg = errorObj?.error?.message || '登录失败，请检查邮箱和密码';
      return { error: errorMsg };
    }

    const userId = signInResult.user?.id;
    if (!userId) {
      return { error: '登录失败：无法获取用户信息' };
    }

    // Immediately sign out - we only wanted to verify the password
    await auth.api.signOut({ headers: headersList });

    // Check if user has TOTP secret set up
    const userProfile = await getDb()
      .select({ totpSecret: profiles.totpSecret })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (userProfile.length === 0 || !userProfile[0].totpSecret) {
      // User doesn't have TOTP set up - let them login and redirect to setup
      const result = await auth.api.signInEmail({
        body: { email, password },
        headers: headersList,
      });

      if (!result || 'error' in result) {
        return { error: '登录失败' };
      }

      // TODO: Redirect to TOTP setup page
      redirect('/settings/security');
    }

    // Create temporary verification token with encrypted password
    const tempToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const encryptedPass = encryptPassword(password);

    // Clean up old tokens for this user
    await getDb()
      .delete(totpVerifications)
      .where(eq(totpVerifications.userId, userId));

    // Insert new token with encrypted password
    await getDb().insert(totpVerifications).values({
      userId,
      token: tempToken,
      encryptedPassword: encryptedPass,
      expiresAt,
      ipAddress,
      userAgent,
    });

    return {
      requireTotp: true,
      tempToken,
      email,
    };
  } catch (err) {
    return { error: parseAuthError(err) };
  }
}

/**
 * Step 2: Verify TOTP code and complete login
 */
export async function verifyTotp(
  tempToken: string,
  code: string,
  email: string
): Promise<{ error?: string } | void> {
  if (!tempToken || !code) {
    return { error: '请输入验证码' };
  }

  const headersList = await headers();

  // Find the verification record
  const verification = await getDb()
    .select({
      id: totpVerifications.id,
      userId: totpVerifications.userId,
      encryptedPassword: totpVerifications.encryptedPassword,
      expiresAt: totpVerifications.expiresAt,
    })
    .from(totpVerifications)
    .where(
      and(
        eq(totpVerifications.token, tempToken),
        gt(totpVerifications.expiresAt, new Date())
      )
    )
    .limit(1);

  if (verification.length === 0) {
    return { error: '验证已过期，请重新登录' };
  }

  const { userId, encryptedPassword, id: verificationId } = verification[0];

  // Get user's TOTP secret
  const userProfile = await getDb()
    .select({
      totpSecret: profiles.totpSecret,
      email: profiles.email,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (userProfile.length === 0 || !userProfile[0].totpSecret) {
    return { error: 'TOTP 未设置' };
  }

  const { totpSecret } = userProfile[0];

  // Verify the TOTP code
  const isValid = verifyTotpCode(totpSecret, code, email);

  if (!isValid) {
    return { error: '验证码错误' };
  }

  // Delete the verification token first
  await getDb()
    .delete(totpVerifications)
    .where(eq(totpVerifications.id, verificationId));

  // Decrypt password and complete login
  try {
    const password = decryptPassword(encryptedPassword);

    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: headersList,
    });

    if (!result || 'error' in result) {
      return { error: '登录失败，请重试' };
    }
  } catch (err) {
    console.error('Failed to complete TOTP login:', err);
    return { error: '登录失败，请重试' };
  }

  redirect('/requests');
}

/**
 * Step 2 (alternative): Verify recovery code and complete login
 */
export async function verifyRecoveryCodeAction(
  tempToken: string,
  code: string,
  _email: string
): Promise<{ error?: string } | void> {
  if (!tempToken || !code) {
    return { error: '请输入恢复码' };
  }

  const headersList = await headers();

  // Find the verification record
  const verification = await getDb()
    .select({
      id: totpVerifications.id,
      userId: totpVerifications.userId,
      encryptedPassword: totpVerifications.encryptedPassword,
      expiresAt: totpVerifications.expiresAt,
    })
    .from(totpVerifications)
    .where(
      and(
        eq(totpVerifications.token, tempToken),
        gt(totpVerifications.expiresAt, new Date())
      )
    )
    .limit(1);

  if (verification.length === 0) {
    return { error: '验证已过期，请重新登录' };
  }

  const { userId, encryptedPassword, id: verificationId } = verification[0];

  // Get user's recovery codes
  const userProfile = await getDb()
    .select({
      totpRecoveryCodes: profiles.totpRecoveryCodes,
      email: profiles.email,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (userProfile.length === 0 || !userProfile[0].totpRecoveryCodes) {
    return { error: '恢复码未设置' };
  }

  const { totpRecoveryCodes, email: userEmail } = userProfile[0];

  // Verify the recovery code
  const result = verifyRecoveryCode(code, totpRecoveryCodes);

  if (!result.valid) {
    return { error: '恢复码错误或已使用' };
  }

  // Mark the recovery code as used
  const updatedCodes = markRecoveryCodeUsed(totpRecoveryCodes, result.index);

  await getDb()
    .update(profiles)
    .set({
      totpRecoveryCodes: updatedCodes,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, userId));

  // Delete the verification token
  await getDb()
    .delete(totpVerifications)
    .where(eq(totpVerifications.id, verificationId));

  // Decrypt password and complete login
  try {
    const password = decryptPassword(encryptedPassword);

    const loginResult = await auth.api.signInEmail({
      body: { email: userEmail, password },
      headers: headersList,
    });

    if (!loginResult || 'error' in loginResult) {
      return { error: '登录失败，请重试' };
    }
  } catch (err) {
    console.error('Failed to complete recovery code login:', err);
    return { error: '登录失败，请重试' };
  }

  redirect('/requests');
}

export async function logout() {
  const headersList = await headers();
  await auth.api.signOut({
    headers: headersList,
  });
  redirect('/login');
}

function parseAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : '未知错误';
  if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
    return '无法连接到认证服务，请检查服务器配置';
  }
  if (message.includes('INVALID_PASSWORD') || message.includes('Invalid credentials')) {
    return '邮箱或密码错误';
  }
  if (message.includes('USER_NOT_FOUND') || message.includes('not found')) {
    return '用户不存在';
  }
  return message;
}
