import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const clusters = pgTable(
  'clusters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(), // 集群代号 (唯一标识符)
    displayName: text('display_name').notNull(), // 集群名称
    region: text('region'), // 区域 (可选)
    dopplerTokenEncrypted: text('doppler_token_encrypted'), // 加密存储的 Doppler Token
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => profiles.id),
  },
  (table) => [
    index('idx_clusters_name').on(table.name),
    index('idx_clusters_enabled').on(table.enabled),
  ]
);
