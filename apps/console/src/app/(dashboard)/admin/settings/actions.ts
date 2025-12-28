'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { systemSettings, auditLogs } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { eq } from 'drizzle-orm';

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * 更新 TOTP 全局开关
 */
export async function updateTotpEnabled(enabled: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // 获取请求元数据
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // 检查是否存在设置记录
      const existing = await tx
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.id, 'default'))
        .limit(1);

      if (existing.length === 0) {
        // 创建新记录
        await tx.insert(systemSettings).values({
          id: 'default',
          totpEnabled: enabled,
          updatedAt: new Date(),
          updatedBy: admin.id,
        });
      } else {
        // 更新现有记录
        await tx
          .update(systemSettings)
          .set({
            totpEnabled: enabled,
            updatedAt: new Date(),
            updatedBy: admin.id,
          })
          .where(eq(systemSettings.id, 'default'));
      }

      // 写入审计日志
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: enabled ? 'settings.totp_enabled' : 'settings.totp_disabled',
        targetType: 'system_settings',
        targetId: 'default',
        payload: { totpEnabled: enabled },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/settings');
    return { success: true };
  } catch (error) {
    console.error('Failed to update TOTP setting:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新设置失败',
    };
  }
}
