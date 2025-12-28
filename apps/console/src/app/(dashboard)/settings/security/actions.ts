'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { profiles } from '@/db/schema';
import { requireAuth } from '@/lib/auth';
import { isTotpEnabled } from '@/lib/queries/system-settings';
import {
  generateTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCodes,
  generateQRCodeDataURL,
  verifyTotpCode,
  getRemainingRecoveryCodesCount,
} from '@/lib/totp';
import { eq } from 'drizzle-orm';

export interface TotpResetResult {
  success: boolean;
  error?: string;
  totpSecret?: string;
  totpQrCode?: string;
  recoveryCodes?: string[];
}

export interface SecurityStatus {
  totpGloballyEnabled: boolean;
  userHasTotp: boolean;
  totpEnabledAt: Date | null;
  remainingRecoveryCodes: number;
}

/**
 * 获取当前用户的安全状态
 */
export async function getSecurityStatus(): Promise<SecurityStatus> {
  const user = await requireAuth();
  const db = getDb();

  const [profile] = await db
    .select({
      totpSecret: profiles.totpSecret,
      totpEnabledAt: profiles.totpEnabledAt,
      totpRecoveryCodes: profiles.totpRecoveryCodes,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const totpGloballyEnabled = await isTotpEnabled();

  let remainingRecoveryCodes = 0;
  if (profile?.totpRecoveryCodes) {
    remainingRecoveryCodes = getRemainingRecoveryCodesCount(profile.totpRecoveryCodes);
  }

  return {
    totpGloballyEnabled,
    userHasTotp: !!profile?.totpSecret,
    totpEnabledAt: profile?.totpEnabledAt || null,
    remainingRecoveryCodes,
  };
}

/**
 * 开始重置 TOTP - 生成新密钥但不保存
 * 返回新的 TOTP 信息供用户绑定
 */
export async function initiateTotpReset(): Promise<TotpResetResult> {
  const user = await requireAuth();

  try {
    // 检查全局 TOTP 是否启用
    const totpGloballyEnabled = await isTotpEnabled();
    if (!totpGloballyEnabled) {
      return {
        success: false,
        error: '系统未启用双因素认证，无法重置',
      };
    }

    // 生成新的 TOTP 密钥
    const totpSecret = generateTotpSecret();
    const totpQrCode = await generateQRCodeDataURL(totpSecret, user.email);

    // 生成新的恢复码
    const recoveryCodes = generateRecoveryCodes();

    return {
      success: true,
      totpSecret,
      totpQrCode,
      recoveryCodes,
    };
  } catch (error) {
    console.error('Failed to initiate TOTP reset:', error);
    return {
      success: false,
      error: '生成 TOTP 信息失败，请重试',
    };
  }
}

/**
 * 确认重置 TOTP - 验证用户输入的验证码后保存新密钥
 */
export async function confirmTotpReset(
  totpSecret: string,
  recoveryCodes: string[],
  verificationCode: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();

  try {
    // 验证用户输入的验证码
    const isValid = verifyTotpCode(totpSecret, verificationCode, user.email);
    if (!isValid) {
      return {
        success: false,
        error: '验证码错误，请重新输入',
      };
    }

    // 哈希恢复码
    const hashedCodes = hashRecoveryCodes(recoveryCodes);

    // 保存新的 TOTP 配置
    await getDb()
      .update(profiles)
      .set({
        totpSecret,
        totpEnabledAt: new Date(),
        totpRecoveryCodes: JSON.stringify(hashedCodes),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));

    revalidatePath('/settings/security');

    return { success: true };
  } catch (error) {
    console.error('Failed to confirm TOTP reset:', error);
    return {
      success: false,
      error: '保存 TOTP 配置失败，请重试',
    };
  }
}

/**
 * 重新生成恢复码
 */
export async function regenerateRecoveryCodes(): Promise<{
  success: boolean;
  error?: string;
  recoveryCodes?: string[];
}> {
  const user = await requireAuth();
  const db = getDb();

  try {
    // 检查用户是否已设置 TOTP
    const [profile] = await db
      .select({ totpSecret: profiles.totpSecret })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    if (!profile?.totpSecret) {
      return {
        success: false,
        error: '您尚未设置双因素认证',
      };
    }

    // 生成新的恢复码
    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = hashRecoveryCodes(recoveryCodes);

    // 保存新的恢复码
    await db
      .update(profiles)
      .set({
        totpRecoveryCodes: JSON.stringify(hashedCodes),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));

    revalidatePath('/settings/security');

    return {
      success: true,
      recoveryCodes,
    };
  } catch (error) {
    console.error('Failed to regenerate recovery codes:', error);
    return {
      success: false,
      error: '重新生成恢复码失败，请重试',
    };
  }
}
