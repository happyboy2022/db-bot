'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { profiles, auditLogs } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { auth } from '@/lib/auth-config';
import { eq } from 'drizzle-orm';
import {
  generateSecurePassword,
  generateTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCodes,
  generateQRCodeDataURL,
} from '@/lib/totp';

interface ActionResult {
  success: boolean;
  error?: string;
}

export interface CreateUserResult {
  success: boolean;
  error?: string;
  credentials?: {
    email: string;
    password: string;
    totpSecret: string;
    totpQrCode: string;
    recoveryCodes: string[];
  };
}

/**
 * Activate a pending user
 */
export async function activateUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Cannot activate yourself
    if (userId === admin.id) {
      return { success: false, error: 'Cannot activate yourself' };
    }

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Update user
      await tx
        .update(profiles)
        .set({
          role: 'USER',
          activatedAt: new Date(),
          activatedBy: admin.id,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'user.activate',
        targetType: 'user',
        targetId: userId,
        payload: { newRole: 'USER' },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to activate user:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to activate user',
    };
  }
}

/**
 * Suspend a user
 */
export async function suspendUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Cannot suspend yourself
    if (userId === admin.id) {
      return { success: false, error: 'Cannot suspend yourself' };
    }

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Update user
      await tx
        .update(profiles)
        .set({
          status: 'SUSPENDED',
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'user.suspend',
        targetType: 'user',
        targetId: userId,
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to suspend user:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suspend user',
    };
  }
}

/**
 * Restore a suspended user
 */
export async function restoreUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Update user
      await tx
        .update(profiles)
        .set({
          status: 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'user.restore',
        targetType: 'user',
        targetId: userId,
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to restore user:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore user',
    };
  }
}

/**
 * Change user role
 */
export async function changeUserRole(
  userId: string,
  newRole: 'USER' | 'ADMIN'
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Cannot change your own role
    if (userId === admin.id) {
      return { success: false, error: 'Cannot change your own role' };
    }

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Update user
      await tx
        .update(profiles)
        .set({
          role: newRole,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'user.role_change',
        targetType: 'user',
        targetId: userId,
        payload: { newRole },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to change user role:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to change user role',
    };
  }
}

/**
 * Create a new user (admin only)
 * Generates password and TOTP credentials automatically
 */
export async function createUser(
  email: string,
  displayName?: string
): Promise<CreateUserResult> {
  try {
    const admin = await requireAdmin();

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // Generate credentials
    const password = generateSecurePassword(16);
    const totpSecret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes(8);
    const hashedRecoveryCodes = hashRecoveryCodes(recoveryCodes);

    // Create user via Better Auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: displayName || email.split('@')[0],
      },
      headers: headersList,
    });

    if (!signUpResult || 'error' in signUpResult) {
      const errorObj = signUpResult as { error?: { message?: string } } | null;
      return {
        success: false,
        error: errorObj?.error?.message || '创建用户失败',
      };
    }

    const userId = signUpResult.user?.id;
    if (!userId) {
      return { success: false, error: '创建用户失败：无法获取用户 ID' };
    }

    // Create profile with TOTP enabled
    await getDb().transaction(async (tx) => {
      await tx.insert(profiles).values({
        id: userId,
        email,
        displayName: displayName || email.split('@')[0],
        role: 'USER',
        status: 'ACTIVE',
        activatedAt: new Date(),
        activatedBy: admin.id,
        totpSecret,
        totpEnabledAt: new Date(),
        totpRecoveryCodes: JSON.stringify(hashedRecoveryCodes),
      });

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'user.create',
        targetType: 'user',
        targetId: userId,
        payload: { email, displayName, hasTotpSetup: true },
        ipAddress,
        userAgent,
      });
    });

    // Generate QR code
    const totpQrCode = await generateQRCodeDataURL(totpSecret, email);

    revalidatePath('/admin/users');
    return {
      success: true,
      credentials: {
        email,
        password,
        totpSecret,
        totpQrCode,
        recoveryCodes,
      },
    };
  } catch (error) {
    console.error('Failed to create user:', error);

    // Check for duplicate email error
    if (error instanceof Error && error.message.includes('unique')) {
      return { success: false, error: '该邮箱已被注册' };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '创建用户失败',
    };
  }
}

/**
 * Get user TOTP info (admin only)
 */
export async function getUserTotpInfo(userId: string): Promise<{
  success: boolean;
  error?: string;
  data?: {
    email: string;
    totpSecret: string | null;
    totpQrCode: string | null;
    recoveryCodes: string[];
    remainingRecoveryCodes: number;
  };
}> {
  try {
    await requireAdmin();

    const user = await getDb()
      .select({
        email: profiles.email,
        totpSecret: profiles.totpSecret,
        totpRecoveryCodes: profiles.totpRecoveryCodes,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (user.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    const { email, totpSecret, totpRecoveryCodes } = user[0];

    let totpQrCode: string | null = null;
    if (totpSecret) {
      totpQrCode = await generateQRCodeDataURL(totpSecret, email);
    }

    // Generate new recovery codes for display (admin can regenerate)
    const newRecoveryCodes = generateRecoveryCodes(8);
    const remainingRecoveryCodes = totpRecoveryCodes
      ? JSON.parse(totpRecoveryCodes).filter((c: string) => c !== '').length
      : 0;

    return {
      success: true,
      data: {
        email,
        totpSecret,
        totpQrCode,
        recoveryCodes: newRecoveryCodes,
        remainingRecoveryCodes,
      },
    };
  } catch (error) {
    console.error('Failed to get user TOTP info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取 TOTP 信息失败',
    };
  }
}

/**
 * Reset user TOTP (admin only)
 */
export async function resetUserTotp(userId: string): Promise<{
  success: boolean;
  error?: string;
  data?: {
    email: string;
    totpSecret: string;
    totpQrCode: string;
    recoveryCodes: string[];
  };
}> {
  try {
    const admin = await requireAdmin();

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    // Get user email
    const user = await getDb()
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (user.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    const email = user[0].email;

    // Generate new TOTP credentials
    const totpSecret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes(8);
    const hashedRecoveryCodes = hashRecoveryCodes(recoveryCodes);

    await getDb().transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          totpSecret,
          totpEnabledAt: new Date(),
          totpRecoveryCodes: JSON.stringify(hashedRecoveryCodes),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'user.totp_reset',
        targetType: 'user',
        targetId: userId,
        ipAddress,
        userAgent,
      });
    });

    // Generate QR code
    const totpQrCode = await generateQRCodeDataURL(totpSecret, email);

    revalidatePath('/admin/users');
    return {
      success: true,
      data: {
        email,
        totpSecret,
        totpQrCode,
        recoveryCodes,
      },
    };
  } catch (error) {
    console.error('Failed to reset user TOTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '重置 TOTP 失败',
    };
  }
}
