/**
 * 系统设置表
 *
 * 存储全局系统配置，如 TOTP 开关等
 */

import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const systemSettings = pgTable('system_settings', {
  // 使用固定 ID 'default' 作为单例记录
  id: text('id').primaryKey().default('default'),

  // TOTP 双因素认证全局开关
  totpEnabled: boolean('totp_enabled').notNull().default(false),

  // 更新时间
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // 最后更新人
  updatedBy: text('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
});
