/**
 * TOTP 验证临时表
 *
 * 存储登录第一步验证成功后的临时状态
 * 用于两步登录流程：密码验证 → TOTP 验证
 */

import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const totpVerifications = pgTable(
  'totp_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // 关联用户
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    // 临时验证令牌
    token: text('token').notNull().unique(),

    // 加密的密码（用于 TOTP 验证后完成登录）
    encryptedPassword: text('encrypted_password').notNull(),

    // 过期时间（通常 5 分钟）
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // 请求元数据
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    // 创建时间
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_totp_verifications_token').on(table.token),
    index('idx_totp_verifications_user_id').on(table.userId),
    index('idx_totp_verifications_expires_at').on(table.expiresAt),
  ]
);
