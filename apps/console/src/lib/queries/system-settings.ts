/**
 * 系统设置查询
 */

import { getDb } from '@/db';
import { systemSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * 获取系统设置
 * 如果不存在则返回默认值
 */
export async function getSystemSettings() {
  const result = await getDb()
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, 'default'))
    .limit(1);

  if (result.length === 0) {
    // 返回默认设置
    return {
      id: 'default',
      totpEnabled: false,
      updatedAt: new Date(),
      updatedBy: null,
    };
  }

  return result[0];
}

/**
 * 检查 TOTP 是否全局启用
 */
export async function isTotpEnabled(): Promise<boolean> {
  const settings = await getSystemSettings();
  return settings.totpEnabled;
}
