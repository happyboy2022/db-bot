/**
 * 用户 Profile 表
 *
 * 扩展 users 表，存储业务相关的用户信息
 * id 直接引用 users.id，使用相同的值
 */

import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { userRole, userStatus } from './enums';
import { users } from './auth';

export const profiles = pgTable(
  'profiles',
  {
    // id 与 users.id 相同，一一对应
    id: text('id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    displayName: text('display_name'),
    role: userRole('role').notNull().default('PENDING'),
    status: userStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    activatedBy: text('activated_by'),

    // TOTP 双因素认证字段
    totpSecret: text('totp_secret'), // Base32 编码的 TOTP 密钥
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }), // TOTP 启用时间
    totpRecoveryCodes: text('totp_recovery_codes'), // JSON 数组，存储哈希后的恢复码
  },
  (table) => [
    index('idx_profiles_email').on(table.email),
    index('idx_profiles_role').on(table.role),
    index('idx_profiles_status').on(table.status),
  ]
);
